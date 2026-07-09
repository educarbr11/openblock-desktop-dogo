const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

const allowedArduinoPackages = new Set(['arduino', 'builtin', 'esp32']);
const allowedExternalExtensions = new Set(['displayLcd', 'ledMatrix']);
const allowedArduinoFirmwares = new Set(['arduinoUno.hex']);
const allowedMicrobitFirmwares = new Set([
    'dogoblock-microbit-realtime-v2.hex',
    'dogoblock-microbit-ble.hex',
    'dogoblock-microbit-ble-v2.hex'
]);
const allowedMicroPythonFirmwares = new Set([
    'ESP32_GENERIC-20250415-v1.25.0.bin',
    'esp32-20220618-v1.19.1.bin'
]);

const removePath = target => {
    if (!fs.existsSync(target)) return;
    const relative = path.relative(root, target);
    if (dryRun) {
        console.log(`[dry-run] remove ${relative}`);
        return;
    }
    fs.rmSync(target, {recursive: true, force: true});
    console.log(`removed ${relative}`);
};

const copyPath = (source, target) => {
    if (!fs.existsSync(source)) return;
    const relativeSource = path.relative(root, source);
    const relativeTarget = path.relative(root, target);
    if (dryRun) {
        console.log(`[dry-run] copy ${relativeSource} -> ${relativeTarget}`);
        return;
    }
    fs.rmSync(target, {recursive: true, force: true});
    fs.cpSync(source, target, {recursive: true});
    console.log(`copied ${relativeSource} -> ${relativeTarget}`);
};

const keepOnlyChildren = (dir, allowedNames) => {
    if (!fs.existsSync(dir)) return;
    for (const child of fs.readdirSync(dir)) {
        if (!allowedNames.has(child)) {
            removePath(path.join(dir, child));
        }
    }
};

const copyLocalExternalExtensions = () => {
    const sourceRoot = path.join(root, 'local-resources', 'extensions');
    const targetRoot = path.join(root, 'external-resources', 'extensions');
    if (!fs.existsSync(sourceRoot)) return;
    if (!dryRun) {
        fs.mkdirSync(targetRoot, {recursive: true});
    }
    for (const extensionId of allowedExternalExtensions) {
        copyPath(path.join(sourceRoot, extensionId), path.join(targetRoot, extensionId));
    }
};

const copyLocalMicrobitFirmwares = () => {
    const sourceRoots = [
        path.join(root, 'node_modules', 'openblock-link', 'firmwares', 'microbit'),
        path.resolve(root, '..', 'openblock-link', 'firmwares', 'microbit')
    ];
    const targetRoot = path.join(root, 'firmwares', 'microbit');
    if (!dryRun) {
        fs.mkdirSync(targetRoot, {recursive: true});
    }
    for (const firmwareName of allowedMicrobitFirmwares) {
        const source = sourceRoots
            .map(sourceRoot => path.join(sourceRoot, firmwareName))
            .find(candidate => fs.existsSync(candidate));
        if (source) {
            copyPath(source, path.join(targetRoot, firmwareName));
        }
    }
};

const pruneArduinoTools = () => {
    const arduinoRoot = path.join(root, 'tools', 'Arduino');
    keepOnlyChildren(path.join(arduinoRoot, 'packages'), allowedArduinoPackages);
};

const pruneExternalResources = () => {
    copyLocalExternalExtensions();
    keepOnlyChildren(path.join(root, 'external-resources', 'extensions'), allowedExternalExtensions);
};

const pruneFirmwares = () => {
    copyLocalMicrobitFirmwares();
    keepOnlyChildren(path.join(root, 'firmwares', 'arduino'), allowedArduinoFirmwares);
    keepOnlyChildren(path.join(root, 'firmwares', 'microbit'), allowedMicrobitFirmwares);
    keepOnlyChildren(path.join(root, 'firmwares', 'microPython'), allowedMicroPythonFirmwares);
};

pruneArduinoTools();
pruneExternalResources();
pruneFirmwares();
