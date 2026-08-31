const crypto = require('crypto');
const EventEmitter = require('events');
const fs = require('fs-extra');
const https = require('https');
const path = require('path');
const {spawnSync} = require('child_process');
const tar = require('tar');
const {URL} = require('url');

const PACK_ID_ESP32 = 'esp32';
const SUPPORTED_PACKS = new Set([PACK_ID_ESP32]);
const MAX_REDIRECTS = 5;

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
    constructor ({dataPath, manifestPath, platform = process.platform, arch = process.arch}) {
        super();
        this._rootPath = path.join(dataPath, 'resource-packs');
        this._manifestPath = manifestPath;
        this._platform = platform;
        this._arch = arch;
        this._operations = new Map();
        this._leases = new Map();
        fs.ensureDirSync(this._rootPath);
        this._cleanupInterruptedOperations();
    }

    _assertPackId (packId) {
        if (!SUPPORTED_PACKS.has(packId)) {
            throw new ResourcePackError('UNKNOWN_PACK', 'Pacote de recursos desconhecido.');
        }
    }

    _readManifest (packId) {
        this._assertPackId(packId);
        const manifest = fs.readJsonSync(this._manifestPath);
        if (manifest.schemaVersion !== 1 || manifest.id !== packId) {
            throw new ResourcePackError('INVALID_MANIFEST', 'O manifesto do pacote ESP32 e invalido.');
        }
        return manifest;
    }

    _variantKey () {
        return `${this._platform}-${this._arch}`;
    }

    _getVariant (manifest) {
        return manifest.variants && manifest.variants[this._variantKey()];
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

    _readActiveInstallation (packId) {
        const activePath = this._activePath(packId);
        if (!fs.existsSync(activePath)) return null;
        try {
            const active = fs.readJsonSync(activePath);
            const installPath = this._versionPath(packId, active.version);
            const packManifestPath = path.join(installPath, 'resource-pack.json');
            if (!fs.existsSync(packManifestPath)) return null;
            const packManifest = fs.readJsonSync(packManifestPath);
            if (packManifest.id !== packId || packManifest.version !== active.version) return null;
            if (!this._criticalFilesExist(installPath, packManifest)) return null;
            return {active, packManifest, installPath};
        } catch (error) {
            return null;
        }
    }

    _criticalFilesExist (installPath, packManifest) {
        const arduinoRoot = path.join(installPath, 'tools', 'Arduino');
        const cliName = this._platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli';
        const coreVersion = safeVersion(packManifest.coreVersion);
        const required = [
            path.join(arduinoRoot, cliName),
            path.join(arduinoRoot, 'packages', 'esp32', 'hardware', 'esp32', coreVersion, 'platform.txt'),
            path.join(arduinoRoot, 'packages', 'esp32', 'tools', 'esp-x32'),
            path.join(arduinoRoot, 'packages', 'esp32', 'tools', 'esp32-arduino-libs'),
            path.join(arduinoRoot, 'packages', 'esp32', 'tools', 'esptool_py')
        ];
        return required.every(candidate => fs.existsSync(candidate));
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
            version: manifest.version,
            minimumVersion: manifest.minimumVersion,
            coreVersion: manifest.coreVersion,
            platform: this._variantKey(),
            downloadBytes: (variant && variant.archiveBytes) || 0,
            installedBytes: (variant && variant.installedBytes) || 0,
            canUse: false
        };
        if (!variant || !variant.url || !/^[a-f0-9]{64}$/i.test(variant.sha256 || '')) {
            return Object.assign(base, {
                phase: 'unsupported',
                message: 'O pacote ESP32 ainda nao esta disponivel para este sistema.'
            });
        }

        const installed = this._readActiveInstallation(packId);
        if (!installed) return Object.assign(base, {phase: 'missing'});

        const installedVersion = installed.packManifest.version;
        const compatible = installed.packManifest.coreVersion === manifest.coreVersion &&
            compareVersions(installedVersion, manifest.minimumVersion) >= 0;
        if (!compatible) {
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
            throw new ResourcePackError('PACK_BUSY', 'Ja existe uma operacao em andamento para o pacote ESP32.');
        }
        const manifest = this._readManifest(packId);
        const variant = this._getVariant(manifest);
        if (!variant || !variant.url || !/^[a-f0-9]{64}$/i.test(variant.sha256 || '')) {
            throw new ResourcePackError('UNSUPPORTED_PLATFORM',
                'O pacote ESP32 ainda nao esta disponivel para este sistema.');
        }

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
        fs.ensureDirSync(packRoot);
        fs.removeSync(archivePath);
        fs.removeSync(stagingPath);

        try {
            const download = await this._download(variant.url, archivePath, controller.signal, progress => {
                this._setOperationStatus(packId, this._operationStatus(manifest, 'downloading', {progress}));
            });
            if (variant.archiveBytes > 0 && download.bytes !== variant.archiveBytes) {
                throw new ResourcePackError('SIZE_MISMATCH',
                    'O tamanho do pacote ESP32 baixado nao corresponde ao manifesto. Tente novamente.');
            }
            if (download.digest.toLowerCase() !== variant.sha256.toLowerCase()) {
                throw new ResourcePackError('CHECKSUM_MISMATCH',
                    'A verificacao de seguranca do pacote ESP32 falhou. Tente baixar novamente.');
            }

            if (controller.signal.aborted) {
                throw new ResourcePackError('CANCELLED', 'A instalacao do pacote ESP32 foi cancelada.');
            }

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
                            'O pacote ESP32 contem um caminho de arquivo inseguro.');
                    }
                    return true;
                }
            });

            if (controller.signal.aborted) {
                throw new ResourcePackError('CANCELLED', 'A instalacao do pacote ESP32 foi cancelada.');
            }

            this._setOperationStatus(packId, this._operationStatus(manifest, 'validating'));
            this._validateExtractedPack(stagingPath, manifest);

            if ((this._leases.get(packId) || 0) > 0) {
                throw new ResourcePackError('PACK_IN_USE',
                    'O pacote ESP32 esta sendo usado por uma compilacao ou envio.');
            }
            fs.removeSync(installPath);
            fs.moveSync(stagingPath, installPath, {overwrite: false});
            this._writeActiveInstallation(packId, manifest.version);
            this._removeInactiveVersions(packId, manifest.version);
            fs.removeSync(archivePath);

            this._operations.delete(packId);
            const ready = this.getStatus(packId);
            this.emit('progress', ready);
            return ready;
        } catch (error) {
            fs.removeSync(archivePath);
            fs.removeSync(stagingPath);
            const normalized = this._normalizeInstallError(error, controller.signal.aborted);
            const status = this._errorStatus(packId, normalized);
            this.emit('progress', status);
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
            throw new ResourcePackError('PACK_BUSY', 'Aguarde a operacao do pacote ESP32 terminar.');
        }
        if ((this._leases.get(packId) || 0) > 0) {
            throw new ResourcePackError('PACK_IN_USE',
                'O pacote ESP32 esta sendo usado por uma compilacao ou envio.');
        }
        fs.removeSync(this._packRoot(packId));
        const status = this.getStatus(packId);
        this.emit('progress', status);
        return status;
    }

    acquire (config, defaultToolsPath) {
        if (!this._isEsp32Config(config)) {
            return {toolsPath: defaultToolsPath, release: () => {}};
        }
        const status = this.getStatus(PACK_ID_ESP32);
        if (!status.canUse) {
            const error = new ResourcePackError('PACK_REQUIRED',
                'Instale o suporte ESP32 antes de compilar ou enviar o programa.');
            error.status = status;
            throw error;
        }
        const installed = this._readActiveInstallation(PACK_ID_ESP32);
        if (!installed) {
            throw new ResourcePackError('PACK_REQUIRED', 'O pacote ESP32 instalado nao foi encontrado.');
        }
        this._leases.set(PACK_ID_ESP32, (this._leases.get(PACK_ID_ESP32) || 0) + 1);
        let released = false;
        return {
            toolsPath: path.join(installed.installPath, 'tools'),
            release: () => {
                if (released) return;
                released = true;
                const next = Math.max(0, (this._leases.get(PACK_ID_ESP32) || 1) - 1);
                this._leases.set(PACK_ID_ESP32, next);
            }
        };
    }

    _isEsp32Config (config) {
        const fqbn = config && config.fqbn;
        const values = typeof fqbn === 'object' ? Object.keys(fqbn || {}).map(key => fqbn[key]) : [fqbn];
        return values.some(value => typeof value === 'string' && value.indexOf('esp32:esp32:') === 0);
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
            throw new ResourcePackError('INVALID_ARCHIVE', 'O pacote ESP32 nao possui um manifesto interno.');
        }
        const internal = fs.readJsonSync(internalManifestPath);
        if (internal.schemaVersion !== 1 || internal.id !== expectedManifest.id ||
            internal.version !== expectedManifest.version || internal.coreVersion !== expectedManifest.coreVersion ||
            internal.platform !== this._variantKey()) {
            throw new ResourcePackError('INVALID_ARCHIVE', 'O pacote ESP32 nao e compativel com este aplicativo.');
        }
        if (!this._criticalFilesExist(stagingPath, internal)) {
            throw new ResourcePackError('INCOMPLETE_PACK', 'O pacote ESP32 esta incompleto.');
        }
        this._validateArduinoCli(stagingPath, internal);
    }

    _validateArduinoCli (stagingPath, internalManifest) {
        const arduinoRoot = path.join(stagingPath, 'tools', 'Arduino');
        const cli = path.join(arduinoRoot, this._platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli');
        if (this._platform !== 'win32') fs.chmodSync(cli, 0o755);
        const validationPath = path.join(stagingPath, '.validation');
        const configPath = path.join(validationPath, 'arduino-cli.yaml');
        fs.ensureDirSync(validationPath);
        this._runCli(cli, ['config', 'init', '--dest-file', configPath]);
        const directories = {
            data: arduinoRoot,
            downloads: path.join(arduinoRoot, 'staging'),
            user: arduinoRoot
        };
        Object.keys(directories).forEach(name => {
            this._runCli(cli, [
                'config', 'set', `directories.${name}`, directories[name], '--config-file', configPath
            ]);
        });
        const cores = this._runCli(cli, ['core', 'list', '--config-file', configPath]).stdout;
        if (cores.indexOf('esp32:esp32') === -1 || cores.indexOf(internalManifest.coreVersion) === -1) {
            throw new ResourcePackError('INCOMPLETE_PACK', 'O Arduino CLI nao encontrou o core ESP32 esperado.');
        }
        this._runCli(cli, ['board', 'details', '--fqbn', 'esp32:esp32:esp32', '--config-file', configPath]);
        this._runCli(cli, ['board', 'details', '--fqbn', 'esp32:esp32:esp32s3', '--config-file', configPath]);
        fs.removeSync(validationPath);
    }

    _runCli (cli, args) {
        const result = spawnSync(cli, args, {encoding: 'utf8'});
        if (result.error || result.status !== 0) {
            const detail = (result.error && result.error.message) || result.stderr || result.stdout || '';
            throw new ResourcePackError('PACK_VALIDATION_FAILED',
                `Nao foi possivel validar o suporte ESP32. ${String(detail).trim()}`.trim());
        }
        return result;
    }

    _download (url, destination, signal, onProgress, redirects = 0) {
        if (redirects > MAX_REDIRECTS) {
            return Promise.reject(new ResourcePackError('TOO_MANY_REDIRECTS',
                'O download do pacote ESP32 excedeu o limite de redirecionamentos.'));
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
                        `Falha ao baixar o pacote ESP32. Servidor respondeu ${response.statusCode}.`));
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
            const abort = () => request.destroy(new ResourcePackError('CANCELLED',
                'A instalacao do pacote ESP32 foi cancelada.'));
            if (signal.aborted) abort();
            signal.addEventListener('abort', abort, {once: true});
        });
    }

    _assertAllowedUrl (url) {
        let parsed;
        try {
            parsed = new URL(url);
        } catch (error) {
            throw new ResourcePackError('INVALID_URL', 'A URL do pacote ESP32 e invalida.');
        }
        const host = parsed.hostname.toLowerCase();
        const allowedHost = host === 'github.com' || host.endsWith('.githubusercontent.com');
        if (parsed.protocol !== 'https:' || !allowedHost) {
            throw new ResourcePackError('UNTRUSTED_URL', 'A origem do pacote ESP32 nao e permitida.');
        }
    }

    _normalizeInstallError (error, aborted) {
        if (aborted || error.code === 'CANCELLED') {
            return new ResourcePackError('CANCELLED', 'A instalacao do pacote ESP32 foi cancelada.');
        }
        if (error.code === 'ENOSPC') {
            return new ResourcePackError('NO_SPACE',
                'Nao ha espaco suficiente para instalar o suporte ESP32. Libere espaco e tente novamente.');
        }
        if (error instanceof ResourcePackError) return error;
        return new ResourcePackError('INSTALL_FAILED',
            `Nao foi possivel instalar o suporte ESP32. ${error.message || error}`);
    }
}

ResourcePackManager.ResourcePackError = ResourcePackError;
ResourcePackManager.PACK_ID_ESP32 = PACK_ID_ESP32;

module.exports = ResourcePackManager;
