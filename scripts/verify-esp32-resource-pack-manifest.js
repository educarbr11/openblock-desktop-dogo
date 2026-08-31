const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'resource-packs', 'esp32.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.schemaVersion !== 1 || manifest.id !== 'esp32') {
    throw new Error('Invalid ESP32 resource pack manifest');
}
['linux-x64', 'win32-x64'].forEach(variantKey => {
    const variant = manifest.variants && manifest.variants[variantKey];
    if (!variant || !variant.url || !/^[a-f0-9]{64}$/i.test(variant.sha256 || '')) {
        throw new Error(`ESP32 resource pack manifest is incomplete for ${variantKey}`);
    }
    if (!(variant.archiveBytes > 0) || !(variant.installedBytes > 0)) {
        throw new Error(`ESP32 resource pack sizes are invalid for ${variantKey}`);
    }
});
console.log(`ESP32 resource pack manifest ${manifest.version} is ready for release.`);
