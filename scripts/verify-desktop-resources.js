const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

const root = path.resolve(__dirname, '..');
const arduinoRoot = path.join(root, 'tools', 'Arduino');
const cli = path.join(arduinoRoot, process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli');
const avrRoot = path.join(arduinoRoot, 'packages', 'arduino', 'hardware', 'avr');
const esp32Root = path.join(arduinoRoot, 'packages', 'esp32');
const r4Root = path.join(arduinoRoot, 'packages', 'arduino', 'hardware', 'renesas_uno');
const pythonRoot = path.join(root, 'tools', 'Python');
const mlVendorRoot = path.join(root, 'dist', 'renderer', 'static', 'ml-vendor');
const installedLink = path.join(root, 'node_modules', 'openblock-link');
const nestedLinkTools = path.join(root, 'node_modules', 'openblock-link', 'tools');
const microbitRealtimeFirmware = path.join(
    root,
    'firmwares',
    'microbit',
    'dogoblock-microbit-realtime-v2.hex'
);

const fail = message => {
    throw new Error(`Desktop resources are incomplete: ${message}`);
};

const findSourceMap = directory => {
    if (!fs.existsSync(directory)) return null;
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            const nested = findSourceMap(entryPath);
            if (nested) return nested;
        } else if (entry.name.endsWith('.map')) {
            return entryPath;
        }
    }
    return null;
};

if (!fs.existsSync(cli)) fail(`missing ${path.relative(root, cli)}`);
if (!fs.existsSync(avrRoot)) fail(`missing ${path.relative(root, avrRoot)}`);
if (fs.existsSync(esp32Root)) fail(`optional ESP32 core leaked into ${path.relative(root, esp32Root)}`);
if (fs.existsSync(r4Root)) fail(`optional Arduino R4 core leaked into ${path.relative(root, r4Root)}`);
if (fs.existsSync(pythonRoot)) fail(`optional Python runtime leaked into ${path.relative(root, pythonRoot)}`);
if (fs.existsSync(mlVendorRoot)) fail(`optional AI/ML assets leaked into ${path.relative(root, mlVendorRoot)}`);
const sourceMap = findSourceMap(path.join(root, 'dist', 'main')) ||
    findSourceMap(path.join(root, 'dist', 'renderer'));
if (sourceMap) fail(`source map leaked into ${path.relative(root, sourceMap)}`);
if (fs.existsSync(nestedLinkTools) && !fs.lstatSync(installedLink).isSymbolicLink()) {
    fail(`duplicated tools found in ${path.relative(root, nestedLinkTools)}`);
}
if (!fs.existsSync(microbitRealtimeFirmware) || fs.statSync(microbitRealtimeFirmware).size === 0) {
    fail(`missing ${path.relative(root, microbitRealtimeFirmware)}`);
}

const avrVersions = fs.readdirSync(avrRoot).filter(version =>
    fs.existsSync(path.join(avrRoot, version, 'platform.txt')) &&
    fs.existsSync(path.join(avrRoot, version, 'boards.txt'))
);
if (avrVersions.length === 0) fail('arduino:avr has no complete installed version');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dogoblock-arduino-'));
const configFile = path.join(temporaryRoot, 'arduino-cli.yaml');
const runCli = args => {
    const result = spawnSync(cli, args, {encoding: 'utf8'});
    if (result.error) throw result.error;
    if (result.status !== 0) {
        fail((result.stderr || result.stdout || `arduino-cli exited with ${result.status}`).trim());
    }
    return result.stdout;
};

try {
    runCli(['config', 'init', '--dest-file', configFile]);
    const directories = {
        data: arduinoRoot,
        downloads: path.join(arduinoRoot, 'staging'),
        user: arduinoRoot
    };
    Object.keys(directories).forEach(name => {
        runCli(['config', 'set', `directories.${name}`, directories[name], '--config-file', configFile]);
    });
    const installedCores = runCli(['core', 'list', '--config-file', configFile]);
    if (!installedCores.includes('arduino:avr')) fail('arduino-cli cannot resolve arduino:avr');
    runCli(['board', 'details', '--fqbn', 'arduino:avr:uno', '--config-file', configFile]);
} finally {
    fs.rmSync(temporaryRoot, {recursive: true, force: true});
}

console.log(
    `Desktop resources verified with arduino:avr ${avrVersions.join(', ')} and micro:bit realtime firmware.`
);
