const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const tar = require('tar');

const ResourcePackManager = require('../src/main/ResourcePackManager');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dogoblock-resource-pack-test-'));
const dataPath = path.join(temporaryRoot, 'Data');
const manifestDirectory = path.join(temporaryRoot, 'manifests');
const platform = 'linux';
const arch = 'x64';
const requiredFile = 'payload/required.txt';

const sha256 = filePath => crypto.createHash('sha256').update(fs.readFileSync(filePath))
    .digest('hex');

const writeManifest = (id, options = {}) => {
    const version = options.version || '1.0.0';
    const variantKey = id === 'ai-ml' ? 'universal' : 'linux-x64';
    const variant = {
        url: `https://github.com/example/release/${id}-${version}.tar.gz`,
        sha256: options.sha256 || 'a'.repeat(64),
        archiveBytes: options.archiveBytes || 100,
        installedBytes: options.installedBytes || 200,
        requiredFiles: options.requiredFiles || [requiredFile]
    };
    const manifest = {
        schemaVersion: 1,
        id,
        displayName: id,
        version,
        minimumVersion: options.minimumVersion || '1.0.0',
        compatibilityVersion: options.compatibilityVersion || `${id}-runtime-v1`,
        requiredFiles: variant.requiredFiles,
        validation: options.validation || {type: 'assets'},
        variants: {[variantKey]: variant}
    };
    fs.ensureDirSync(manifestDirectory);
    fs.writeJsonSync(path.join(manifestDirectory, `${id}.json`), manifest);
    return manifest;
};

const installFakePack = (id, version = '1.0.0') => {
    const installPath = path.join(dataPath, 'resource-packs', id, version);
    fs.outputFileSync(path.join(installPath, requiredFile), id);
    const manifest = fs.readJsonSync(path.join(manifestDirectory, `${id}.json`));
    fs.writeJsonSync(path.join(installPath, 'resource-pack.json'), {
        schemaVersion: 1,
        id,
        version,
        compatibilityVersion: manifest.compatibilityVersion,
        platform: id === 'ai-ml' ? 'universal' : 'linux-x64'
    });
    fs.writeJsonSync(path.join(dataPath, 'resource-packs', id, 'active.json'), {version});
    return installPath;
};

const makeArchive = async (id, version) => {
    const source = path.join(temporaryRoot, `${id}-${version}`);
    const archive = path.join(temporaryRoot, `${id}-${version}.tar.gz`);
    fs.outputFileSync(path.join(source, requiredFile), `${id}-${version}`);
    const manifest = fs.readJsonSync(path.join(manifestDirectory, `${id}.json`));
    fs.writeJsonSync(path.join(source, 'resource-pack.json'), {
        schemaVersion: 1,
        id,
        version,
        compatibilityVersion: manifest.compatibilityVersion,
        platform: id === 'ai-ml' ? 'universal' : 'linux-x64'
    });
    await tar.c({cwd: source, file: archive, gzip: true}, ['payload', 'resource-pack.json']);
    return archive;
};

class LocalArchiveManager extends ResourcePackManager {
    constructor (options, archivePath) {
        super(options);
        this.archivePath = archivePath;
    }

    _download (url, destination, signal, onProgress) { // eslint-disable-line no-unused-vars
        if (signal.aborted) return Promise.reject(Object.assign(new Error('cancelled'), {code: 'CANCELLED'}));
        fs.copyFileSync(this.archivePath, destination);
        onProgress(1);
        return Promise.resolve({digest: sha256(destination), bytes: fs.statSync(destination).size});
    }
}

const managerOptions = {dataPath, manifestDirectory, platform, arch};

const run = async () => {
    ['esp32', 'ai-ml', 'arduino-r4', 'microbit-python'].forEach(id => writeManifest(id));
    let manager = new ResourcePackManager(managerOptions);
    assert.strictEqual(manager.getStatus('esp32').phase, 'missing');
    assert.strictEqual(manager.getStatus('unknown').errorCode, 'UNKNOWN_PACK');

    const pythonValidation = {
        executable: 'tools/Python/bin/python3',
        commands: [['-m', 'microfs', '--help'], ['-m', 'uflash', '--help']]
    };
    ['linux', 'win32'].forEach(testPlatform => {
        const pythonManager = new ResourcePackManager(Object.assign({}, managerOptions, {platform: testPlatform}));
        const stagingPath = path.join(temporaryRoot, `python-${testPlatform}`);
        const executable = path.join(stagingPath, testPlatform === 'win32' ?
            'tools/Python/python.exe' : pythonValidation.executable);
        fs.outputFileSync(executable, 'test executable');
        const commands = [];
        pythonManager._runCommand = (command, args) => commands.push({command, args});
        pythonManager._validatePython(stagingPath, {id: 'microbit-python'}, pythonValidation);
        assert.deepStrictEqual(commands, pythonValidation.commands.map(args => ({command: executable, args})));
    });

    const installPaths = {};
    ['esp32', 'ai-ml', 'arduino-r4', 'microbit-python'].forEach(id => {
        installPaths[id] = installFakePack(id);
    });
    manager = new ResourcePackManager(managerOptions);
    assert.strictEqual(manager.getStatus('ai-ml').phase, 'ready');
    assert.strictEqual(manager.acquire({fqbn: 'arduino:avr:uno'}, '/default/tools').toolsPath, '/default/tools');
    assert.strictEqual(
        manager.acquire({fqbn: 'esp32:esp32:esp32'}, '/default/tools').toolsPath,
        path.join(installPaths.esp32, 'tools')
    );
    assert.strictEqual(
        manager.acquire({fqbn: 'arduino:renesas_uno:unor4wifi'}, '/default/tools').toolsPath,
        path.join(installPaths['arduino-r4'], 'tools')
    );
    const pythonLease = manager.acquire({type: 'microbit'}, '/default/tools');
    assert.strictEqual(pythonLease.toolsPath, path.join(installPaths['microbit-python'], 'tools'));
    pythonLease.release();

    const rendererLease = manager.acquirePack('ai-ml', 10);
    assert.strictEqual(manager.resolvePackFile('ai-ml', requiredFile), path.join(installPaths['ai-ml'], requiredFile));
    assert.throws(() => manager.resolvePackFile('ai-ml', '../outside'), error => error.code === 'INVALID_PATH');
    assert.throws(() => manager.remove('ai-ml'), error => error.code === 'PACK_IN_USE');
    manager.releaseOwner(10);
    assert.strictEqual(manager.releasePack(rendererLease.leaseId), false);

    writeManifest('ai-ml', {version: '1.1.0'});
    let status = manager.getStatus('ai-ml');
    assert.strictEqual(status.phase, 'updateAvailable');
    assert.strictEqual(status.canUse, true);
    const archive = await makeArchive('ai-ml', '1.1.0');
    const archiveBytes = fs.statSync(archive).size;
    writeManifest('ai-ml', {
        version: '1.1.0',
        sha256: sha256(archive),
        archiveBytes,
        installedBytes: 1024 * 1024
    });
    const installManager = new LocalArchiveManager(managerOptions, archive);
    status = await installManager.install('ai-ml');
    assert.strictEqual(status.phase, 'ready');
    assert.strictEqual(status.installedVersion, '1.1.0');
    assert.strictEqual(fs.existsSync(path.join(installPaths['ai-ml'], requiredFile)), false);

    writeManifest('ai-ml', {
        version: '1.1.0',
        sha256: 'b'.repeat(64),
        archiveBytes,
        installedBytes: 1024 * 1024
    });
    const checksumManager = new LocalArchiveManager(managerOptions, archive);
    await assert.rejects(checksumManager.install('ai-ml'), error => error.code === 'CHECKSUM_MISMATCH');
    assert.strictEqual(checksumManager.getStatus('ai-ml').installedVersion, '1.1.0');

    const spaceManager = new ResourcePackManager(managerOptions);
    spaceManager._availableBytes = () => 1;
    await assert.rejects(spaceManager.install('esp32'), error => error.code === 'NO_SPACE');

    const cancelManager = new ResourcePackManager(managerOptions);
    cancelManager._download = (url, destination, signal) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), {code: 'CANCELLED'})));
    });
    const pendingInstall = cancelManager.install('esp32');
    assert.strictEqual(cancelManager.cancel('esp32'), true);
    await assert.rejects(pendingInstall, error => error.code === 'CANCELLED');

    console.log('ResourcePackManager routing, leases, validation and atomic update tests passed.');
};

run().finally(() => fs.removeSync(temporaryRoot))
    .catch(error => {
        console.error(error.stack || error);
        process.exitCode = 1;
    });
