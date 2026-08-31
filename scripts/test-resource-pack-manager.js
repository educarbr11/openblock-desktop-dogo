const assert = require('assert');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const ResourcePackManager = require('../src/main/ResourcePackManager');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dogoblock-resource-pack-test-'));
const dataPath = path.join(temporaryRoot, 'Data');
const manifestPath = path.join(temporaryRoot, 'esp32.json');
const platform = 'linux';
const arch = 'x64';

const writeExternalManifest = (version, minimumVersion = '1.0.0') => {
    fs.writeJsonSync(manifestPath, {
        schemaVersion: 1,
        id: 'esp32',
        version,
        minimumVersion,
        coreVersion: '3.1.3',
        variants: {
            'linux-x64': {
                url: `https://github.com/example/release/esp32-${version}.tar.gz`,
                sha256: 'a'.repeat(64),
                archiveBytes: 100,
                installedBytes: 200
            }
        }
    });
};

const installFakePack = version => {
    const installPath = path.join(dataPath, 'resource-packs', 'esp32', version);
    const arduinoRoot = path.join(installPath, 'tools', 'Arduino');
    [
        path.join(arduinoRoot, 'packages', 'esp32', 'tools', 'esp-x32'),
        path.join(arduinoRoot, 'packages', 'esp32', 'tools', 'esp32-arduino-libs'),
        path.join(arduinoRoot, 'packages', 'esp32', 'tools', 'esptool_py')
    ].forEach(directory => fs.ensureDirSync(directory));
    fs.ensureFileSync(path.join(arduinoRoot, 'arduino-cli'));
    fs.ensureFileSync(path.join(
        arduinoRoot,
        'packages',
        'esp32',
        'hardware',
        'esp32',
        '3.1.3',
        'platform.txt'
    ));
    fs.writeJsonSync(path.join(installPath, 'resource-pack.json'), {
        schemaVersion: 1,
        id: 'esp32',
        version,
        coreVersion: '3.1.3',
        platform: 'linux-x64'
    });
    fs.writeJsonSync(path.join(dataPath, 'resource-packs', 'esp32', 'active.json'), {version});
    return installPath;
};

try {
    writeExternalManifest('1.0.0');
    let manager = new ResourcePackManager({dataPath, manifestPath, platform, arch});
    assert.strictEqual(manager.getStatus('esp32').phase, 'missing');

    const installPath = installFakePack('1.0.0');
    manager = new ResourcePackManager({dataPath, manifestPath, platform, arch});
    assert.strictEqual(manager.getStatus('esp32').phase, 'ready');

    const avrLease = manager.acquire({fqbn: 'arduino:avr:uno'}, '/default/tools');
    assert.strictEqual(avrLease.toolsPath, '/default/tools');

    const esp32Lease = manager.acquire({fqbn: {linux: 'esp32:esp32:esp32'}}, '/default/tools');
    assert.strictEqual(esp32Lease.toolsPath, path.join(installPath, 'tools'));
    assert.throws(() => manager.remove('esp32'), error => error.code === 'PACK_IN_USE');
    esp32Lease.release();

    writeExternalManifest('1.1.0');
    manager = new ResourcePackManager({dataPath, manifestPath, platform, arch});
    const optionalUpdate = manager.getStatus('esp32');
    assert.strictEqual(optionalUpdate.phase, 'updateAvailable');
    assert.strictEqual(optionalUpdate.canUse, true);

    writeExternalManifest('1.1.0', '1.1.0');
    manager = new ResourcePackManager({dataPath, manifestPath, platform, arch});
    const requiredUpdate = manager.getStatus('esp32');
    assert.strictEqual(requiredUpdate.phase, 'updateAvailable');
    assert.strictEqual(requiredUpdate.canUse, false);

    manager.remove('esp32');
    assert.strictEqual(manager.getStatus('esp32').phase, 'missing');
    console.log('ResourcePackManager state, compatibility and lease tests passed.');
} finally {
    fs.removeSync(temporaryRoot);
}
