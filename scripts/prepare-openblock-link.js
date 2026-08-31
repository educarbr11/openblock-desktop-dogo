const fs = require('fs');
const path = require('path');
const prepareUsbNativeBuild = require('./prepare-usb-native-build');

const root = path.resolve(__dirname, '..');
const installedLink = path.join(root, 'node_modules', 'openblock-link');
const installedLinkRealPath = fs.existsSync(installedLink) ? fs.realpathSync(installedLink) : null;
const candidates = [
    process.env.OPENBLOCK_LINK_PATH,
    path.join(root, 'openblock-link'),
    path.resolve(root, '..', 'openblock-link')
].filter(Boolean).map(candidate => path.resolve(candidate));

const sourceLink = candidates.find(candidate =>
    fs.existsSync(path.join(candidate, 'package.json')) &&
    fs.existsSync(path.join(candidate, 'src', 'upload', 'arduino.js')) &&
    (!installedLinkRealPath || fs.realpathSync(candidate) !== installedLinkRealPath)
);

if (sourceLink) {
    ['src', 'script', 'firmwares'].forEach(directory => {
        const source = path.join(sourceLink, directory);
        const target = path.join(installedLink, directory);
        if (!fs.existsSync(source)) return;
        fs.rmSync(target, {recursive: true, force: true});
        fs.cpSync(source, target, {recursive: true});
    });
    console.log(`Synchronized openblock-link runtime from ${sourceLink}.`);
}

prepareUsbNativeBuild();

const arduinoUploader = path.join(installedLink, 'src', 'upload', 'arduino.js');
if (!fs.existsSync(arduinoUploader)) {
    throw new Error('Desktop openblock-link runtime is missing Arduino uploader.');
}

const uploaderSource = fs.readFileSync(arduinoUploader, 'utf8');
[
    "os.platform() === 'win32' ? 'arduino-cli.exe' : 'arduino-cli'",
    'Arduino CLI config validation'
].forEach(marker => {
    if (!uploaderSource.includes(marker)) {
        throw new Error(
            `Desktop openblock-link is outdated (${marker}). Set OPENBLOCK_LINK_PATH to the current repository.`
        );
    }
});

const serialportSession = path.join(installedLink, 'src', 'session', 'serialport.js');
const serialportSource = fs.existsSync(serialportSession) ? fs.readFileSync(serialportSession, 'utf8') : '';
if (!serialportSource.includes(
    "path.resolve(\n                this.toolsPath,\n                '..',\n                'firmwares'"
)) {
    throw new Error(
        'Desktop openblock-link cannot resolve the packaged micro:bit firmware. ' +
        'Set OPENBLOCK_LINK_PATH to the current repository.'
    );
}
if (!serialportSource.includes('_acquireTools (config)') || !serialportSource.includes('toolsLease.release()')) {
    throw new Error(
        'Desktop openblock-link does not support optional tool providers. ' +
        'Set OPENBLOCK_LINK_PATH to the current repository.'
    );
}

console.log('Desktop openblock-link runtime is ready.');
