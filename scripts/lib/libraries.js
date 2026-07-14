const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const guiCandidates = [
    process.env.OPENBLOCK_GUI_PATH,
    path.resolve(root, '..', 'openblock-gui')
].filter(Boolean);

try {
    guiCandidates.push(path.dirname(require.resolve('openblock-gui/package.json')));
} catch (error) {
    // The validation below reports the actionable error.
}

const guiRoot = guiCandidates.find(candidate =>
    fs.existsSync(path.join(candidate, 'src', 'lib', 'libraries', 'sprites.json'))
);

if (!guiRoot) {
    throw new Error('Could not find the OpenBlock GUI media libraries. Set OPENBLOCK_GUI_PATH.');
}

const loadLibrary = name => JSON.parse(fs.readFileSync(
    path.join(guiRoot, 'src', 'lib', 'libraries', `${name}.json`),
    'utf8'
));

const backdrops = loadLibrary('backdrops');
const costumes = loadLibrary('costumes');
const sounds = loadLibrary('sounds');
const sprites = loadLibrary('sprites');

const libraries = {
    backdrops,
    costumes,
    sounds,
    sprites
};

module.exports = libraries;
