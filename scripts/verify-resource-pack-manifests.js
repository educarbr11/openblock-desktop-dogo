const fs = require('fs');
const https = require('https');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const checkRemote = args.includes('--remote');
const positional = args.filter(arg => arg !== '--remote');
const manifestRoot = positional[0] ? path.resolve(positional[0]) : path.join(root, 'resource-packs');
const requestedPack = positional[1] || null;
const expectedVariants = {
    'ai-ml': ['universal'],
    'arduino-r4': ['linux-x64', 'win32-x64'],
    'microbit-python': ['linux-x64', 'win32-x64'],
    'esp32': ['linux-x64', 'win32-x64']
};
const packIds = requestedPack ? [requestedPack] : Object.keys(expectedVariants);
const urls = [];

const checkUrl = (url, redirects = 0) => new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error(`Too many redirects for ${url}`));
    const request = https.request(url, {method: 'HEAD'}, response => {
        response.resume();
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            const next = new URL(response.headers.location, url);
            if (next.protocol !== 'https:') return reject(new Error(`Insecure redirect for ${url}`));
            checkUrl(next.toString(), redirects + 1).then(resolve, reject);
        } else if (response.statusCode === 200) {
            resolve();
        } else {
            reject(new Error(`Resource pack asset returned HTTP ${response.statusCode}: ${url}`));
        }
    });
    request.setTimeout(15000, () => request.destroy(new Error(`Timeout checking ${url}`)));
    request.on('error', reject);
    request.end();
});

packIds.forEach(packId => {
    if (!expectedVariants[packId]) throw new Error(`Unknown resource pack: ${packId}`);
    const manifestPath = path.join(manifestRoot, `${packId}.json`);
    if (!fs.existsSync(manifestPath)) throw new Error(`Missing ${manifestPath}`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.schemaVersion !== 1 || manifest.id !== packId || !manifest.version ||
        !manifest.minimumVersion || (!manifest.compatibilityVersion && !manifest.coreVersion)) {
        throw new Error(`Invalid ${packId} resource pack manifest`);
    }
    if (packId !== 'esp32' && (!Array.isArray(manifest.requiredFiles) || manifest.requiredFiles.length === 0)) {
        throw new Error(`${packId} manifest has no required files`);
    }
    expectedVariants[packId].forEach(variantKey => {
        const variant = manifest.variants && manifest.variants[variantKey];
        if (!variant || !variant.url || !/^[a-f0-9]{64}$/i.test(variant.sha256 || '')) {
            throw new Error(`${packId} manifest is incomplete for ${variantKey}`);
        }
        if (!(variant.archiveBytes > 0) || !(variant.installedBytes > 0)) {
            throw new Error(`${packId} sizes are invalid for ${variantKey}`);
        }
        if (packId !== 'esp32' && (!Array.isArray(variant.requiredFiles) || variant.requiredFiles.length === 0)) {
            throw new Error(`${packId} required files are missing for ${variantKey}`);
        }
        urls.push(variant.url);
    });
    console.log(`${packId} resource pack manifest ${manifest.version} is ready for release.`);
});

if (checkRemote) {
    Promise.all(urls.map(checkUrl))
        .then(() => {
            console.log(`Verified ${urls.length} published resource pack assets.`);
        })
        .catch(error => {
            console.error(error.message);
            process.exitCode = 1;
        });
}
