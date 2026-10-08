const fs = require('fs-extra');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const packId = process.argv[2];
const inputRoot = process.argv[3] ? path.resolve(process.argv[3]) : path.join(ROOT, 'dist', 'resource-packs');
const outputPath = process.argv[4] ? path.resolve(process.argv[4]) : path.join(inputRoot, `${packId}.json`);

const expectedVariants = {
    'ai-ml': ['universal'],
    'arduino-r4': ['linux-x64', 'win32-x64'],
    'microbit-python': ['linux-x64', 'win32-x64'],
    'esp32': ['linux-x64', 'win32-x64']
};

if (!expectedVariants[packId]) {
    throw new Error(`Unknown resource pack: ${packId || '(missing)'}`);
}

let base = null;
const variants = {};
expectedVariants[packId].forEach(variantKey => {
    const fragmentPath = path.join(inputRoot, `${packId}-${variantKey}.json`);
    if (!fs.existsSync(fragmentPath)) throw new Error(`Missing ${fragmentPath}`);
    const fragment = fs.readJsonSync(fragmentPath);
    if (fragment.id !== packId || !fragment.variants || !fragment.variants[variantKey]) {
        throw new Error(`Invalid ${packId} fragment for ${variantKey}`);
    }
    if (base && (fragment.version !== base.version ||
        fragment.compatibilityVersion !== base.compatibilityVersion)) {
        throw new Error(`${packId} resource pack fragments have incompatible versions`);
    }
    base = base || fragment;
    variants[variantKey] = fragment.variants[variantKey];
});

const manifest = Object.assign({}, base, {variants});
delete manifest.platform;
fs.writeJsonSync(outputPath, manifest, {spaces: 2});
console.log(`Created ${outputPath}`);
