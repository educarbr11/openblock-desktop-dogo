const crypto = require('crypto');
const EventEmitter = require('events');
const fs = require('fs-extra');
const https = require('https');
const path = require('path');
const {spawnSync} = require('child_process');
const tar = require('tar');
const {URL} = require('url');

const SUPPORTED_PACKS = new Set(['esp32', 'ai-ml', 'arduino-r4', 'microbit-python']);
const MAX_REDIRECTS = 5;
const INSTALL_HEADROOM_BYTES = 100 * 1024 * 1024;

class ResourcePackError extends Error {
    constructor (code, message) {
        super(message);
        this.code = code;
    }
}

const safeVersion = version => String(version || '').replace(/[^a-z0-9._-]/gi, '_');

const compareVersions = (left, right) => {
    const normalize = version => String(version || '0').split('.')
        .map(part => parseInt(part, 10) || 0);
    const a = normalize(left);
    const b = normalize(right);
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i++) {
        if ((a[i] || 0) > (b[i] || 0)) return 1;
        if ((a[i] || 0) < (b[i] || 0)) return -1;
    }
    return 0;
};

class ResourcePackManager extends EventEmitter {
    constructor ({
        dataPath,
        manifestDirectory,
        manifestPath,
        manifestPaths,
        platform = process.platform,
        arch = process.arch
    }) {
        super();
        this._rootPath = path.join(dataPath, 'resource-packs');
        this._manifestDirectory = manifestDirectory || null;
        this._legacyManifestPath = manifestPath || null;
        this._manifestPaths = manifestPaths || {};
        this._platform = platform;
        this._arch = arch;
        this._operations = new Map();
        this._leases = new Map();
        this._leaseRecords = new Map();
        fs.ensureDirSync(this._rootPath);
        this._cleanupInterruptedOperations();
    }

    _assertPackId (packId) {
        if (!SUPPORTED_PACKS.has(packId)) {
            throw new ResourcePackError('UNKNOWN_PACK', 'Pacote de recursos desconhecido.');
        }
    }

    _getManifestPath (packId) {
        if (this._manifestPaths[packId]) return this._manifestPaths[packId];
        if (this._manifestDirectory) return path.join(this._manifestDirectory, `${packId}.json`);
        if (this._legacyManifestPath) return this._legacyManifestPath;
        throw new ResourcePackError('MISSING_MANIFEST', 'O manifesto do pacote nao foi configurado.');
    }

    _readManifest (packId) {
        this._assertPackId(packId);
        const manifestPath = this._getManifestPath(packId);
        if (!fs.existsSync(manifestPath)) {
            throw new ResourcePackError('MISSING_MANIFEST', `Manifesto do pacote ${packId} nao encontrado.`);
        }
        const manifest = fs.readJsonSync(manifestPath);
        if (manifest.schemaVersion !== 1 || manifest.id !== packId) {
            throw new ResourcePackError('INVALID_MANIFEST', `O manifesto do pacote ${packId} e invalido.`);
        }
        return manifest;
    }

    _packName (manifestOrId) {
        if (manifestOrId && typeof manifestOrId === 'object') {
            return manifestOrId.displayName || manifestOrId.id;
        }
        try {
            return this._readManifest(manifestOrId).displayName || manifestOrId;
        } catch (error) {
            return manifestOrId;
        }
    }

    _variantKey () {
        return `${this._platform}-${this._arch}`;
    }

    _getVariant (manifest) {
        const variants = manifest.variants || {};
        return variants[this._variantKey()] || variants.universal;
    }

    _packRoot (packId) {
        return path.join(this._rootPath, packId);
    }

    _versionPath (packId, version) {
        return path.join(this._packRoot(packId), safeVersion(version));
    }

    _activePath (packId) {
        return path.join(this._packRoot(packId), 'active.json');
    }

    _readActiveInstallation (packId, expectedManifest = null) {
        const activePath = this._activePath(packId);
        if (!fs.existsSync(activePath)) return null;
        try {
            const active = fs.readJsonSync(activePath);
            const installPath = this._versionPath(packId, active.version);
            const packManifestPath = path.join(installPath, 'resource-pack.json');
            if (!fs.existsSync(packManifestPath)) return null;
            const packManifest = fs.readJsonSync(packManifestPath);
            if (packManifest.id !== packId || packManifest.version !== active.version) return null;
            const manifest = expectedManifest || this._readManifest(packId);
            if (!this._criticalFilesExist(installPath, manifest)) return null;
            return {active, packManifest, installPath};
        } catch (error) {
            return null;
        }
    }

    _criticalFilesExist (installPath, manifest) {
        const variant = this._getVariant(manifest) || {};
        let requiredFiles = variant.requiredFiles || manifest.requiredFiles || [];
        if (requiredFiles.length === 0 && manifest.id === 'esp32') {
            const cliName = this._platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli';
            requiredFiles = [
                `tools/Arduino/${cliName}`,
                `tools/Arduino/packages/esp32/hardware/esp32/${safeVersion(manifest.coreVersion)}/platform.txt`,
                'tools/Arduino/packages/esp32/tools/esp-x32',
                'tools/Arduino/packages/esp32/tools/esp32-arduino-libs',
                'tools/Arduino/packages/esp32/tools/esptool_py'
            ];
        }
        return requiredFiles.length > 0 && requiredFiles.every(relativePath =>
            fs.existsSync(path.join(installPath, relativePath))
        );
    }

    getStatus (packId) {
        let manifest;
        try {
            manifest = this._readManifest(packId);
        } catch (error) {
            return this._errorStatus(packId, error);
        }

        const operation = this._operations.get(packId);
        if (operation) return operation.status;

        const variant = this._getVariant(manifest);
        const base = {
            id: packId,
            displayName: manifest.displayName || packId,
            description: manifest.description || '',
            version: manifest.version,
            minimumVersion: manifest.minimumVersion,
            coreVersion: manifest.coreVersion,
            platform: variant === (manifest.variants || {}).universal ? 'universal' : this._variantKey(),
            downloadBytes: (variant && variant.archiveBytes) || 0,
            installedBytes: (variant && variant.installedBytes) || 0,
            canUse: false
        };
        if (!variant || !variant.url || !/^[a-f0-9]{64}$/i.test(variant.sha256 || '')) {
            return Object.assign(base, {
                phase: 'unsupported',
                message: `${base.displayName} ainda nao esta disponivel para este sistema.`
            });
        }

        const installed = this._readActiveInstallation(packId, manifest);
        if (!installed) return Object.assign(base, {phase: 'missing'});

        const installedVersion = installed.packManifest.version;
        const expectedCompatibility = manifest.compatibilityVersion || manifest.coreVersion;
        const installedCompatibility = installed.packManifest.compatibilityVersion ||
            installed.packManifest.coreVersion;
        const compatibleRuntime = !expectedCompatibility || installedCompatibility === expectedCompatibility;
        const compatibleVersion = compareVersions(installedVersion, manifest.minimumVersion) >= 0;
        if (!compatibleRuntime || !compatibleVersion) {
            return Object.assign(base, {
                phase: 'updateAvailable',
                installedVersion,
                canUse: false,
                updateRequired: true
            });
        }
        if (compareVersions(installedVersion, manifest.version) < 0) {
            return Object.assign(base, {
                phase: 'updateAvailable',
                installedVersion,
                canUse: true,
                updateRequired: false
            });
        }
        return Object.assign(base, {
            phase: 'ready',
            installedVersion,
            canUse: true
        });
    }

    _errorStatus (packId, error) {
        return {
            id: packId,
            displayName: this._packName(packId),
            phase: 'error',
            canUse: false,
            errorCode: error.code || 'UNKNOWN_ERROR',
            message: error.message
        };
    }

    _setOperationStatus (packId, status) {
        const operation = this._operations.get(packId);
        if (operation) operation.status = status;
        this.emit('progress', status);
    }

    _operationStatus (manifest, phase, extra = {}) {
        const variant = this._getVariant(manifest) || {};
        return Object.assign({
            id: manifest.id,
            displayName: manifest.displayName || manifest.id,
            description: manifest.description || '',
            phase,
            version: manifest.version,
            coreVersion: manifest.coreVersion,
            downloadBytes: variant.archiveBytes || 0,
            installedBytes: variant.installedBytes || 0,
            progress: 0,
            canUse: false
        }, extra);
    }

    async install (packId) {
        this._assertPackId(packId);
        if (this._operations.has(packId)) {
            throw new ResourcePackError(
                'PACK_BUSY',
                `Ja existe uma operacao em andamento para ${this._packName(packId)}.`
            );
        }
        const manifest = this._readManifest(packId);
        const variant = this._getVariant(manifest);
        if (!variant || !variant.url || !/^[a-f0-9]{64}$/i.test(variant.sha256 || '')) {
            throw new ResourcePackError('UNSUPPORTED_PLATFORM',
                `${this._packName(manifest)} ainda nao esta disponivel para este sistema.`);
        }
        this._assertAvailableSpace(variant);

        const controller = new AbortController();
        const operation = {
            controller,
            status: this._operationStatus(manifest, 'downloading')
        };
        this._operations.set(packId, operation);
        this.emit('progress', operation.status);

        const packRoot = this._packRoot(packId);
        const archivePath = path.join(packRoot, `${safeVersion(manifest.version)}.tar.gz.partial`);
        const stagingPath = path.join(packRoot, `${safeVersion(manifest.version)}.staging`);
        const installPath = this._versionPath(packId, manifest.version);
        const previousPath = `${installPath}.previous`;
        let installationSwapped = false;
        fs.ensureDirSync(packRoot);
        fs.removeSync(archivePath);
        fs.removeSync(stagingPath);
        fs.removeSync(previousPath);

        try {
            const download = await this._download(variant.url, archivePath, controller.signal, progress => {
                this._setOperationStatus(packId, this._operationStatus(manifest, 'downloading', {progress}));
            });
            if (variant.archiveBytes > 0 && download.bytes !== variant.archiveBytes) {
                throw new ResourcePackError('SIZE_MISMATCH',
                    `O tamanho baixado de ${this._packName(manifest)} nao corresponde ao manifesto.`);
            }
            if (download.digest.toLowerCase() !== variant.sha256.toLowerCase()) {
                throw new ResourcePackError('CHECKSUM_MISMATCH',
                    `A verificacao de seguranca de ${this._packName(manifest)} falhou. Tente novamente.`);
            }
            if (controller.signal.aborted) throw this._cancelledError(manifest);

            this._setOperationStatus(packId, this._operationStatus(manifest, 'extracting'));
            fs.ensureDirSync(stagingPath);
            await tar.x({
                cwd: stagingPath,
                file: archivePath,
                strict: true,
                filter: (entryPath, entry) => {
                    const isLink = entry && ['Link', 'SymbolicLink'].indexOf(entry.type) !== -1;
                    if (!this._isSafeArchivePath(entryPath) || isLink) {
                        throw new ResourcePackError('INVALID_ARCHIVE',
                            `O pacote ${this._packName(manifest)} contem um caminho inseguro.`);
                    }
                    return true;
                }
            });
            if (controller.signal.aborted) throw this._cancelledError(manifest);

            this._setOperationStatus(packId, this._operationStatus(manifest, 'validating'));
            this._validateExtractedPack(stagingPath, manifest);
            if ((this._leases.get(packId) || 0) > 0) {
                throw new ResourcePackError('PACK_IN_USE',
                    `${this._packName(manifest)} esta sendo usado e nao pode ser atualizado agora.`);
            }
            if (fs.existsSync(installPath)) fs.moveSync(installPath, previousPath, {overwrite: false});
            fs.moveSync(stagingPath, installPath, {overwrite: false});
            installationSwapped = true;
            this._writeActiveInstallation(packId, manifest.version);
            fs.removeSync(previousPath);
            this._removeInactiveVersions(packId, manifest.version);
            fs.removeSync(archivePath);

            this._operations.delete(packId);
            const ready = this.getStatus(packId);
            this.emit('progress', ready);
            return ready;
        } catch (error) {
            fs.removeSync(archivePath);
            fs.removeSync(stagingPath);
            if (installationSwapped) fs.removeSync(installPath);
            if (fs.existsSync(previousPath)) fs.moveSync(previousPath, installPath, {overwrite: true});
            const normalized = this._normalizeInstallError(error, controller.signal.aborted, manifest);
            this.emit('progress', this._errorStatus(packId, normalized));
            throw normalized;
        } finally {
            this._operations.delete(packId);
        }
    }

    cancel (packId) {
        this._assertPackId(packId);
        const operation = this._operations.get(packId);
        if (!operation) return false;
        operation.controller.abort();
        return true;
    }

    remove (packId) {
        this._assertPackId(packId);
        if (this._operations.has(packId)) {
            throw new ResourcePackError('PACK_BUSY', `Aguarde a operacao de ${this._packName(packId)} terminar.`);
        }
        if ((this._leases.get(packId) || 0) > 0) {
            throw new ResourcePackError('PACK_IN_USE',
                `${this._packName(packId)} esta sendo usado e nao pode ser removido agora.`);
        }
        fs.removeSync(this._packRoot(packId));
        const status = this.getStatus(packId);
        this.emit('progress', status);
        return status;
    }

    acquire (config, defaultToolsPath) {
        const packId = this._resolveToolsPack(config);
        if (!packId) return {toolsPath: defaultToolsPath, release: () => {}};
        const lease = this._acquireInstalledPack(packId);
        return {
            toolsPath: path.join(lease.installPath, 'tools'),
            release: lease.release
        };
    }

    acquirePack (packId, ownerId = null) {
        const lease = this._acquireInstalledPack(packId, ownerId);
        return {
            id: packId,
            leaseId: lease.leaseId,
            installPath: lease.installPath,
            status: this.getStatus(packId)
        };
    }

    releasePack (leaseId) {
        const record = this._leaseRecords.get(leaseId);
        if (!record) return false;
        this._leaseRecords.delete(leaseId);
        const next = Math.max(0, (this._leases.get(record.packId) || 1) - 1);
        this._leases.set(record.packId, next);
        return true;
    }

    releaseOwner (ownerId) {
        Array.from(this._leaseRecords.entries()).forEach(([leaseId, record]) => {
            if (record.ownerId === ownerId) this.releasePack(leaseId);
        });
    }

    resolvePackFile (packId, relativePath) {
        this._assertPackId(packId);
        const installed = this._readActiveInstallation(packId);
        if (!installed) throw new ResourcePackError('PACK_REQUIRED', `${this._packName(packId)} nao esta instalado.`);
        const normalized = path.posix.normalize(String(relativePath || '').replace(/\\/g, '/'));
        if (!normalized || normalized === '..' || normalized.indexOf('../') === 0 || path.isAbsolute(normalized)) {
            throw new ResourcePackError('INVALID_PATH', 'Caminho de recurso invalido.');
        }
        const root = fs.realpathSync(installed.installPath);
        const candidate = path.resolve(root, normalized);
        if (candidate !== root && candidate.indexOf(`${root}${path.sep}`) !== 0) {
            throw new ResourcePackError('INVALID_PATH', 'Caminho de recurso invalido.');
        }
        if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
            throw new ResourcePackError('RESOURCE_NOT_FOUND', 'Recurso opcional nao encontrado.');
        }
        const realCandidate = fs.realpathSync(candidate);
        if (realCandidate.indexOf(`${root}${path.sep}`) !== 0) {
            throw new ResourcePackError('INVALID_PATH', 'O recurso solicitado esta fora do pacote.');
        }
        return realCandidate;
    }

    _acquireInstalledPack (packId, ownerId = null) {
        const status = this.getStatus(packId);
        if (!status.canUse) {
            const error = new ResourcePackError('PACK_REQUIRED',
                `Instale ${status.displayName || packId} antes de continuar.`);
            error.status = status;
            throw error;
        }
        const installed = this._readActiveInstallation(packId);
        if (!installed) throw new ResourcePackError('PACK_REQUIRED', `${this._packName(packId)} nao foi encontrado.`);
        const leaseId = crypto.randomBytes(16).toString('hex');
        this._leases.set(packId, (this._leases.get(packId) || 0) + 1);
        this._leaseRecords.set(leaseId, {packId, ownerId});
        let released = false;
        return {
            installPath: installed.installPath,
            leaseId,
            release: () => {
                if (released) return;
                released = true;
                this.releasePack(leaseId);
            }
        };
    }

    _resolveToolsPack (config) {
        if (config && config.resourcePackId) return config.resourcePackId;
        if (config && config.type === 'microbit') return 'microbit-python';
        const fqbn = config && config.fqbn;
        const values = typeof fqbn === 'object' ? Object.keys(fqbn || {}).map(key => fqbn[key]) : [fqbn];
        if (values.some(value => typeof value === 'string' && value.indexOf('esp32:esp32:') === 0)) {
            return 'esp32';
        }
        if (values.some(value => typeof value === 'string' && value.indexOf('arduino:renesas_uno:') === 0)) {
            return 'arduino-r4';
        }
        return null;
    }

    _writeActiveInstallation (packId, version) {
        const packRoot = this._packRoot(packId);
        const temporaryPath = path.join(packRoot, 'active.json.tmp');
        fs.writeJsonSync(temporaryPath, {version}, {spaces: 2});
        fs.moveSync(temporaryPath, this._activePath(packId), {overwrite: true});
    }

    _removeInactiveVersions (packId, activeVersion) {
        const packRoot = this._packRoot(packId);
        if (!fs.existsSync(packRoot)) return;
        const keep = new Set([safeVersion(activeVersion), 'active.json']);
        fs.readdirSync(packRoot).forEach(name => {
            if (!keep.has(name)) fs.removeSync(path.join(packRoot, name));
        });
    }

    _cleanupInterruptedOperations () {
        if (!fs.existsSync(this._rootPath)) return;
        fs.readdirSync(this._rootPath).forEach(packId => {
            const packRoot = path.join(this._rootPath, packId);
            if (!fs.statSync(packRoot).isDirectory()) return;
            fs.readdirSync(packRoot).forEach(name => {
                if (name.endsWith('.partial') || name.endsWith('.staging') || name.endsWith('.tmp')) {
                    fs.removeSync(path.join(packRoot, name));
                } else if (name.endsWith('.previous')) {
                    const previousPath = path.join(packRoot, name);
                    const installPath = path.join(packRoot, name.slice(0, -'.previous'.length));
                    if (fs.existsSync(installPath)) fs.removeSync(previousPath);
                    else fs.moveSync(previousPath, installPath, {overwrite: false});
                }
            });
        });
    }

    _isSafeArchivePath (entryPath) {
        if (!entryPath || path.isAbsolute(entryPath)) return false;
        const normalized = path.posix.normalize(String(entryPath).replace(/\\/g, '/'));
        return normalized !== '..' && normalized.indexOf('../') !== 0;
    }

    _validateExtractedPack (stagingPath, expectedManifest) {
        const internalManifestPath = path.join(stagingPath, 'resource-pack.json');
        if (!fs.existsSync(internalManifestPath)) {
            throw new ResourcePackError('INVALID_ARCHIVE',
                `${this._packName(expectedManifest)} nao possui manifesto interno.`);
        }
        const internal = fs.readJsonSync(internalManifestPath);
        const expectedPlatform = this._getVariant(expectedManifest) === (expectedManifest.variants || {}).universal ?
            'universal' : this._variantKey();
        const expectedCompatibility = expectedManifest.compatibilityVersion || expectedManifest.coreVersion;
        const internalCompatibility = internal.compatibilityVersion || internal.coreVersion;
        if (internal.schemaVersion !== 1 || internal.id !== expectedManifest.id ||
            internal.version !== expectedManifest.version || internal.platform !== expectedPlatform ||
            (expectedCompatibility && internalCompatibility !== expectedCompatibility)) {
            throw new ResourcePackError('INVALID_ARCHIVE',
                `${this._packName(expectedManifest)} nao e compativel com este aplicativo.`);
        }
        if (!this._criticalFilesExist(stagingPath, expectedManifest)) {
            throw new ResourcePackError('INCOMPLETE_PACK', `${this._packName(expectedManifest)} esta incompleto.`);
        }
        const validation = expectedManifest.validation || {};
        if (validation.type === 'arduino') this._validateArduinoCli(stagingPath, expectedManifest, validation);
        if (validation.type === 'python') this._validatePython(stagingPath, expectedManifest, validation);
    }

    _validateArduinoCli (stagingPath, manifest, validation) {
        const arduinoRoot = path.join(stagingPath, 'tools', 'Arduino');
        const cli = path.join(arduinoRoot, this._platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli');
        if (this._platform !== 'win32') fs.chmodSync(cli, 0o755);
        const validationPath = path.join(stagingPath, '.validation');
        const configPath = path.join(validationPath, 'arduino-cli.yaml');
        fs.ensureDirSync(validationPath);
        this._runCommand(cli, ['config', 'init', '--dest-file', configPath], manifest);
        const directories = {data: arduinoRoot, downloads: path.join(arduinoRoot, 'staging'), user: arduinoRoot};
        Object.keys(directories).forEach(name => this._runCommand(cli, [
            'config', 'set', `directories.${name}`, directories[name], '--config-file', configPath
        ], manifest));
        const cores = this._runCommand(cli, ['core', 'list', '--config-file', configPath], manifest).stdout;
        if (validation.coreId && cores.indexOf(validation.coreId) === -1) {
            throw new ResourcePackError('INCOMPLETE_PACK',
                `O Arduino CLI nao encontrou o core esperado em ${this._packName(manifest)}.`);
        }
        (validation.boardFqbns || []).forEach(fqbn => this._runCommand(cli, [
            'board', 'details', '--fqbn', fqbn, '--config-file', configPath
        ], manifest));
        fs.removeSync(validationPath);
    }

    _validatePython (stagingPath, manifest, validation) {
        // The merged manifest may carry the Linux executable from its first fragment.
        const relativeExecutable = this._platform === 'win32' && manifest.id === 'microbit-python' ?
            'tools/Python/python.exe' : validation.executable;
        const executable = path.join(stagingPath, relativeExecutable);
        if (this._platform !== 'win32') fs.chmodSync(executable, 0o755);
        (validation.commands || []).forEach(args => this._runCommand(executable, args, manifest));
    }

    _runCommand (executable, args, manifest) {
        const result = spawnSync(executable, args, {encoding: 'utf8'});
        if (result.error || result.status !== 0) {
            const detail = (result.error && result.error.message) || result.stderr || result.stdout || '';
            throw new ResourcePackError('PACK_VALIDATION_FAILED',
                `Nao foi possivel validar ${this._packName(manifest)}. ${String(detail).trim()}`.trim());
        }
        return result;
    }

    _assertAvailableSpace (variant) {
        const required = (variant.archiveBytes || 0) + (variant.installedBytes || 0) + INSTALL_HEADROOM_BYTES;
        if (required <= INSTALL_HEADROOM_BYTES) return;
        const available = this._availableBytes(this._rootPath);
        if (available !== null && available < required) {
            throw new ResourcePackError('NO_SPACE',
                'Nao ha espaco suficiente para instalar este recurso. Libere espaco e tente novamente.');
        }
    }

    _availableBytes (targetPath) {
        try {
            if (this._platform === 'win32') {
                const drive = path.parse(path.resolve(targetPath)).root.replace(/[\\:]/g, '');
                const result = spawnSync('powershell.exe', [
                    '-NoProfile', '-Command', `(Get-PSDrive -Name '${drive}').Free`
                ], {encoding: 'utf8'});
                if (result.status === 0) return Number(String(result.stdout).trim()) || null;
                return null;
            }
            const result = spawnSync('df', ['-Pk', targetPath], {encoding: 'utf8'});
            if (result.status !== 0) return null;
            const lines = String(result.stdout).trim()
                .split(/\r?\n/);
            const columns = lines[lines.length - 1].trim().split(/\s+/);
            return (Number(columns[3]) || 0) * 1024;
        } catch (error) {
            return null;
        }
    }

    _download (url, destination, signal, onProgress, redirects = 0) {
        if (redirects > MAX_REDIRECTS) {
            return Promise.reject(new ResourcePackError('TOO_MANY_REDIRECTS',
                'O download excedeu o limite de redirecionamentos.'));
        }
        this._assertAllowedUrl(url);
        return new Promise((resolve, reject) => {
            const request = https.get(url, {
                headers: {'User-Agent': 'DoGoBlock-Desktop-ResourcePackManager'}
            }, response => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    response.resume();
                    const nextUrl = new URL(response.headers.location, url).toString();
                    this._download(nextUrl, destination, signal, onProgress, redirects + 1).then(resolve, reject);
                    return;
                }
                if (response.statusCode !== 200) {
                    response.resume();
                    reject(new ResourcePackError('DOWNLOAD_FAILED',
                        `Falha ao baixar o pacote. Servidor respondeu ${response.statusCode}.`));
                    return;
                }
                const total = parseInt(response.headers['content-length'], 10) || 0;
                let downloaded = 0;
                const hash = crypto.createHash('sha256');
                const output = fs.createWriteStream(destination);
                response.on('data', chunk => {
                    downloaded += chunk.length;
                    hash.update(chunk);
                    onProgress(total > 0 ? Math.min(1, downloaded / total) : 0);
                });
                response.pipe(output);
                output.on('finish', () => output.close(() => resolve({
                    digest: hash.digest('hex'),
                    bytes: downloaded
                })));
                output.on('error', reject);
                response.on('error', reject);
            });
            request.on('error', reject);
            const abort = () => request.destroy(new ResourcePackError('CANCELLED', 'A instalacao foi cancelada.'));
            if (signal.aborted) abort();
            signal.addEventListener('abort', abort, {once: true});
        });
    }

    _assertAllowedUrl (url) {
        let parsed;
        try {
            parsed = new URL(url);
        } catch (error) {
            throw new ResourcePackError('INVALID_URL', 'A URL do pacote e invalida.');
        }
        const host = parsed.hostname.toLowerCase();
        const allowedHost = host === 'github.com' || host.endsWith('.githubusercontent.com');
        if (parsed.protocol !== 'https:' || !allowedHost) {
            throw new ResourcePackError('UNTRUSTED_URL', 'A origem do pacote nao e permitida.');
        }
    }

    _cancelledError (manifest) {
        return new ResourcePackError('CANCELLED', `A instalacao de ${this._packName(manifest)} foi cancelada.`);
    }

    _normalizeInstallError (error, aborted, manifest) {
        if (aborted || error.code === 'CANCELLED') return this._cancelledError(manifest);
        if (error.code === 'ENOSPC') {
            return new ResourcePackError('NO_SPACE',
                `Nao ha espaco suficiente para instalar ${this._packName(manifest)}.`);
        }
        if (error instanceof ResourcePackError) return error;
        return new ResourcePackError('INSTALL_FAILED',
            `Nao foi possivel instalar ${this._packName(manifest)}. ${error.message || error}`);
    }
}

ResourcePackManager.ResourcePackError = ResourcePackError;
ResourcePackManager.SUPPORTED_PACKS = SUPPORTED_PACKS;

module.exports = ResourcePackManager;
