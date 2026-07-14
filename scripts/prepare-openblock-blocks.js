const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const installedBlocks = path.join(root, 'node_modules', 'openblock-blocks');
const installedBlocksRealPath = fs.existsSync(installedBlocks) ? fs.realpathSync(installedBlocks) : null;
const candidates = [
    process.env.OPENBLOCK_BLOCKS_PATH,
    path.join(root, 'openblock-blocks'),
    path.resolve(root, '..', 'openblock-blocks')
].filter(Boolean).map(candidate => path.resolve(candidate));

const sourceBlocks = candidates.find(candidate =>
    fs.existsSync(path.join(candidate, 'package.json')) &&
    fs.existsSync(path.join(candidate, 'arduino_compressed.js')) &&
    fs.existsSync(path.join(candidate, 'python_compressed.js')) &&
    (!installedBlocksRealPath || fs.realpathSync(candidate) !== installedBlocksRealPath)
);

if (!sourceBlocks) {
    throw new Error(
        'Could not find the current openblock-blocks source. ' +
        'Set OPENBLOCK_BLOCKS_PATH to the checked out repository.'
    );
}

fs.mkdirSync(installedBlocks, {recursive: true});

const runtimeFiles = [
    'arduino_compressed.js',
    'blockly_compressed_horizontal.js',
    'blockly_compressed_vertical.js',
    'blockly_uncompressed_horizontal.js',
    'blockly_uncompressed_vertical.js',
    'blocks_compressed.js',
    'blocks_compressed_horizontal.js',
    'blocks_compressed_vertical.js',
    'python_compressed.js'
];
const runtimeDirectories = [
    'blocks_common',
    'blocks_horizontal',
    'blocks_vertical',
    'core',
    'dist',
    'generators',
    'i18n',
    'media',
    'msg',
    'shim'
];

runtimeFiles.forEach(file => {
    fs.copyFileSync(path.join(sourceBlocks, file), path.join(installedBlocks, file));
});

runtimeDirectories.forEach(directory => {
    const source = path.join(sourceBlocks, directory);
    const target = path.join(installedBlocks, directory);
    fs.rmSync(target, {recursive: true, force: true});
    fs.cpSync(source, target, {recursive: true});
});

const requiredGeneratorMarkers = [
    ['python_compressed.js', 'microbit_display_showImage'],
    ['generators/python/microbit.js', "Blockly.Python['microbit_sensor_soundLevel']"],
    ['generators/python/microbit.js', "Blockly.Python['microbit_whenLogo']"],
    ['arduino_compressed.js', 'arduino_pin_setDigitalOutput']
];

requiredGeneratorMarkers.forEach(([file, marker]) => {
    const target = path.join(installedBlocks, file);
    if (!fs.readFileSync(target, 'utf8').includes(marker)) {
        throw new Error(`Desktop openblock-blocks is missing ${marker} in ${file}.`);
    }
});

console.log(`Synchronized openblock-blocks runtime from ${sourceBlocks}.`);
