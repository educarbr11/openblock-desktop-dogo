const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

const allowedArduinoPackages = new Set(['arduino', 'builtin', 'esp32']);
const allowedArduinoFirmwares = new Set(['arduinoUno.hex']);
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

const keepOnlyChildren = (dir, allowedNames) => {
    if (!fs.existsSync(dir)) return;
    for (const child of fs.readdirSync(dir)) {
        if (!allowedNames.has(child)) {
            removePath(path.join(dir, child));
        }
    }
};

const pruneArduinoTools = () => {
    const arduinoRoot = path.join(root, 'tools', 'Arduino');
    keepOnlyChildren(path.join(arduinoRoot, 'packages'), allowedArduinoPackages);
};

const pruneExternalResources = () => {
    removePath(path.join(root, 'external-resources', 'extensions'));
};

const pruneFirmwares = () => {
    keepOnlyChildren(path.join(root, 'firmwares', 'arduino'), allowedArduinoFirmwares);
    keepOnlyChildren(path.join(root, 'firmwares', 'microPython'), allowedMicroPythonFirmwares);
};

pruneArduinoTools();
pruneExternalResources();
pruneFirmwares();
