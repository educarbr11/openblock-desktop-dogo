const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

const root = path.resolve(__dirname, '..');
const arduinoRoot = path.join(root, 'tools', 'Arduino');
const cli = path.join(arduinoRoot, process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli');
const avrRoot = path.join(arduinoRoot, 'packages', 'arduino', 'hardware', 'avr');
const esp32Root = path.join(arduinoRoot, 'packages', 'esp32');
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

if (!fs.existsSync(cli)) fail(`missing ${path.relative(root, cli)}`);
if (!fs.existsSync(avrRoot)) fail(`missing ${path.relative(root, avrRoot)}`);
if (fs.existsSync(esp32Root)) fail(`optional ESP32 core leaked into ${path.relative(root, esp32Root)}`);
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
