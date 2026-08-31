const fs = require('fs-extra');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const inputRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'dist', 'resource-packs');
const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : path.join(inputRoot, 'esp32.json');
const variants = {};
let base = null;

['linux-x64', 'win32-x64'].forEach(variantKey => {
    const fragmentPath = path.join(inputRoot, `esp32-${variantKey}.json`);
    if (!fs.existsSync(fragmentPath)) throw new Error(`Missing ${fragmentPath}`);
    const fragment = fs.readJsonSync(fragmentPath);
    base = base || fragment;
    if (fragment.version !== base.version || fragment.coreVersion !== base.coreVersion) {
        throw new Error('ESP32 resource pack fragments have different versions');
    }
    variants[variantKey] = fragment.variants[variantKey];
});

fs.writeJsonSync(outputPath, {
    schemaVersion: 1,
    id: 'esp32',
    version: base.version,
    minimumVersion: base.minimumVersion,
    coreVersion: base.coreVersion,
    variants
}, {spaces: 2});
console.log(`Created ${outputPath}`);
