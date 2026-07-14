const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const installedBlocks = path.join(root, 'node_modules', 'openblock-blocks');
const installedBlocksRealPath = fs.existsSync(installedBlocks) ? fs.realpathSync(installedBlocks) : null;
const bundledGenerators = path.join(root, 'scripts', 'vendor', 'openblock-blocks');
const candidates = [
    process.env.OPENBLOCK_BLOCKS_PATH,
    path.join(root, 'openblock-blocks'),
    path.resolve(root, '..', 'openblock-blocks')
].filter(Boolean).map(candidate => path.resolve(candidate));

const sourceBlocks = candidates.find(candidate =>
    fs.existsSync(path.join(candidate, 'package.json')) &&
    fs.existsSync(path.join(candidate, 'generators', 'arduino.js')) &&
    fs.existsSync(path.join(candidate, 'generators', 'python.js')) &&
    (!installedBlocksRealPath || fs.realpathSync(candidate) !== installedBlocksRealPath)
);

if (!sourceBlocks) {
    throw new Error(
        'Could not find the current openblock-blocks source. ' +
        'Set OPENBLOCK_BLOCKS_PATH to the checked out repository.'
    );
}

fs.mkdirSync(installedBlocks, {recursive: true});

const generatedFiles = [
    'arduino_compressed.js',
    'python_compressed.js'
];

generatedFiles.forEach(file => {
    const bundledFile = path.join(bundledGenerators, file);
    if (!fs.existsSync(bundledFile)) {
        throw new Error(`Desktop is missing the bundled openblock-blocks generator: ${file}.`);
    }
    fs.copyFileSync(bundledFile, path.join(installedBlocks, file));
});

const requiredGeneratorMarkers = [
    ['generators/python/microbit.js', "Blockly.Python['microbit_sensor_soundLevel']"],
    ['generators/python/microbit.js', "Blockly.Python['microbit_whenLogo']"],
    ['generators/arduino/arduino.js', "Blockly.Arduino['arduino_pin_setDigitalOutput']"]
];

requiredGeneratorMarkers.forEach(([file, marker]) => {
    const source = path.join(sourceBlocks, file);
    if (!fs.readFileSync(source, 'utf8').includes(marker)) {
        throw new Error(`Checked out openblock-blocks is missing ${marker} in ${file}.`);
    }
});

console.log(`Validated openblock-blocks sources from ${sourceBlocks}.`);
console.log(`Installed deterministic generator bundles from ${bundledGenerators}.`);
