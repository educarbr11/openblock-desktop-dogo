const crypto = require('crypto');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const tar = require('tar');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ARDUINO = path.join(ROOT, 'tools', 'Arduino');
const OUTPUT_ROOT = path.join(ROOT, 'dist', 'resource-packs');
const CORE_VERSION = '3.1.3';
const DEFAULT_PACK_VERSION = '1.0.0';
const RELEASE_REPOSITORY = 'educarbr11/openblock-desktop-dogo';

const readOption = (name, fallback) => {
    const prefix = `--${name}=`;
    const option = process.argv.find(argument => argument.indexOf(prefix) === 0);
    return option ? option.slice(prefix.length) : fallback;
};

const platform = readOption('platform', process.platform);
const arch = readOption('arch', process.arch);
const packVersion = readOption('version', DEFAULT_PACK_VERSION);
const variantKey = `${platform}-${arch}`;
const archiveName = `dogoblock-esp32-pack-v${packVersion}-${variantKey}.tar.gz`;
const archivePath = path.join(OUTPUT_ROOT, archiveName);
const stagingRoot = path.join(OUTPUT_ROOT, `.esp32-${variantKey}.staging`);
const stagingArduino = path.join(stagingRoot, 'tools', 'Arduino');

const fail = message => {
    throw new Error(`ESP32 resource pack: ${message}`);
};

const copyRequired = (source, target) => {
    if (!fs.existsSync(source)) fail(`missing ${path.relative(ROOT, source)}`);
    fs.ensureDirSync(path.dirname(target));
    fs.copySync(source, target, {dereference: true});
};

const copyArduinoRootFile = name => copyRequired(
    path.join(SOURCE_ARDUINO, name),
    path.join(stagingArduino, name)
);

const directorySize = target => {
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) return stat.size;
    return fs.readdirSync(target).reduce((total, child) => total + directorySize(path.join(target, child)), 0);
};

const sha256File = target => new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(target);
    input.on('data', chunk => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolve(hash.digest('hex')));
});

const runCli = (cli, args) => {
    const result = spawnSync(cli, args, {encoding: 'utf8'});
    if (result.error || result.status !== 0) {
        fail(((result.error && result.error.message) || result.stderr || result.stdout || 'Arduino CLI failed').trim());
    }
    return result.stdout;
};

const validatePack = () => {
    const cliName = platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli';
    const cli = path.join(stagingArduino, cliName);
    if (platform !== 'win32') fs.chmodSync(cli, 0o755);
    const validationRoot = path.join(stagingRoot, '.validation');
    const configPath = path.join(validationRoot, 'arduino-cli.yaml');
    const sketchPath = path.join(validationRoot, 'sketch');
    fs.ensureDirSync(sketchPath);
    fs.writeFileSync(path.join(sketchPath, 'sketch.ino'), [
        '#include <Arduino.h>',
        'void setup() { pinMode(2, OUTPUT); }',
        'void loop() { digitalWrite(2, HIGH); delay(100); digitalWrite(2, LOW); delay(100); }',
        ''
    ].join('\n'));
    runCli(cli, ['config', 'init', '--dest-file', configPath]);
    const directories = {
        data: stagingArduino,
        downloads: path.join(stagingArduino, 'staging'),
        user: stagingArduino
    };
    Object.keys(directories).forEach(name => runCli(cli, [
        'config', 'set', `directories.${name}`, directories[name], '--config-file', configPath
    ]));
    runCli(cli, [
        'compile', '--fqbn', 'esp32:esp32:esp32', '--libraries', path.join(stagingArduino, 'libraries'),
        '--build-path', path.join(validationRoot, 'build-esp32'), '--config-file', configPath, sketchPath
    ]);
    runCli(cli, [
        'compile', '--fqbn', 'esp32:esp32:esp32s3', '--libraries', path.join(stagingArduino, 'libraries'),
        '--build-path', path.join(validationRoot, 'build-esp32s3'), '--config-file', configPath, sketchPath
    ]);
    fs.removeSync(validationRoot);
};

const build = async () => {
    if (!['linux', 'win32'].includes(platform) || arch !== 'x64') {
        fail(`unsupported target ${variantKey}`);
    }
    fs.removeSync(stagingRoot);
    fs.ensureDirSync(stagingArduino);
    fs.ensureDirSync(OUTPUT_ROOT);

    const cliName = platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli';
    [cliName, 'LICENSE.txt', 'package_index.json', 'library_index.json', 'package_esp32_index.json']
        .forEach(copyArduinoRootFile);

    copyRequired(path.join(SOURCE_ARDUINO, 'libraries'), path.join(stagingArduino, 'libraries'));
    copyRequired(path.join(SOURCE_ARDUINO, 'packages', 'builtin'),
        path.join(stagingArduino, 'packages', 'builtin'));
    copyRequired(path.join(SOURCE_ARDUINO, 'packages', 'arduino', 'tools', 'dfu-util'),
        path.join(stagingArduino, 'packages', 'arduino', 'tools', 'dfu-util'));
    copyRequired(path.join(SOURCE_ARDUINO, 'packages', 'esp32', 'hardware', 'esp32', CORE_VERSION),
        path.join(stagingArduino, 'packages', 'esp32', 'hardware', 'esp32', CORE_VERSION));

    ['esp-x32', 'esptool_py', 'mkspiffs', 'mklittlefs'].forEach(tool => copyRequired(
        path.join(SOURCE_ARDUINO, 'packages', 'esp32', 'tools', tool),
        path.join(stagingArduino, 'packages', 'esp32', 'tools', tool)
    ));

    const libraryVersion = 'idf-release_v5.3-489d7a2b-v1';
    const librarySource = path.join(
        SOURCE_ARDUINO, 'packages', 'esp32', 'tools', 'esp32-arduino-libs', libraryVersion
    );
    const libraryTarget = path.join(
        stagingArduino, 'packages', 'esp32', 'tools', 'esp32-arduino-libs', libraryVersion
    );
    ['esp32', 'esp32s3', 'package.json', 'versions.txt', 'tools.json'].forEach(name => copyRequired(
        path.join(librarySource, name), path.join(libraryTarget, name)
    ));
    fs.ensureDirSync(path.join(stagingArduino, 'staging'));
    fs.ensureDirSync(path.join(stagingArduino, 'tmp'));

    const internalManifest = {
        schemaVersion: 1,
        id: 'esp32',
        version: packVersion,
        coreVersion: CORE_VERSION,
        platform: variantKey,
        createdAt: new Date().toISOString()
    };
    fs.writeJsonSync(path.join(stagingRoot, 'resource-pack.json'), internalManifest, {spaces: 2});
    validatePack();

    const installedBytes = directorySize(stagingRoot);
    fs.removeSync(archivePath);
    await tar.c({
        cwd: stagingRoot,
        file: archivePath,
        gzip: {level: 9},
        portable: true
    }, ['resource-pack.json', 'tools']);
    const sha256 = await sha256File(archivePath);
    const archiveBytes = fs.statSync(archivePath).size;
    const url = `https://github.com/${RELEASE_REPOSITORY}/releases/download/` +
        `esp32-pack-v${packVersion}/${archiveName}`;
    const fragment = {
        schemaVersion: 1,
        id: 'esp32',
        version: packVersion,
        minimumVersion: packVersion,
        coreVersion: CORE_VERSION,
        variants: {
            [variantKey]: {
                url,
                sha256,
                archiveBytes,
                installedBytes
            }
        }
    };
    const fragmentPath = path.join(OUTPUT_ROOT, `esp32-${variantKey}.json`);
    fs.writeJsonSync(fragmentPath, fragment, {spaces: 2});
    fs.writeFileSync(path.join(OUTPUT_ROOT, `${archiveName}.sha256`), `${sha256}  ${archiveName}${os.EOL}`);
    fs.removeSync(stagingRoot);
    console.log(`Created ${path.relative(ROOT, archivePath)} (${archiveBytes} bytes)`);
    console.log(`SHA-256 ${sha256}`);
    console.log(`Installed size ${installedBytes} bytes`);
};

build().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
