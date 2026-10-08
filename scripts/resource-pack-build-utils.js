const crypto = require('crypto');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const tar = require('tar');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(ROOT, 'dist', 'resource-packs');
const RELEASE_REPOSITORY = 'educarbr11/openblock-desktop-dogo';

const readOption = (name, fallback) => {
    const prefix = `--${name}=`;
    const option = process.argv.find(argument => argument.indexOf(prefix) === 0);
    return option ? option.slice(prefix.length) : fallback;
};

const copyRequired = (source, target, label) => {
    if (!fs.existsSync(source)) throw new Error(`${label}: missing ${path.relative(ROOT, source)}`);
    fs.ensureDirSync(path.dirname(target));
    fs.copySync(source, target, {dereference: true});
};

const directorySize = target => {
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) return stat.size;
    return fs.readdirSync(target).reduce((total, child) => total + directorySize(path.join(target, child)), 0);
};

const sha256File = target => new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(target);
    input.on('data', chunk => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolve(hash.digest('hex')));
});

const finalizePack = async ({
    id,
    displayName,
    description,
    version,
    compatibilityVersion,
    platform,
    arch,
    stagingRoot,
    archivePrefix,
    releaseTagPrefix,
    requiredFiles,
    validation,
    maximumInstalledBytes,
    extraManifest = {}
}) => {
    const variantKey = platform === 'universal' ? 'universal' : `${platform}-${arch}`;
    const archiveName = platform === 'universal' ?
        `${archivePrefix}-v${version}.tar.gz` : `${archivePrefix}-v${version}-${variantKey}.tar.gz`;
    const archivePath = path.join(OUTPUT_ROOT, archiveName);
    const internalManifest = Object.assign({
        schemaVersion: 1,
        id,
        version,
        compatibilityVersion,
        platform: variantKey,
        createdAt: new Date().toISOString()
    }, extraManifest);
    fs.writeJsonSync(path.join(stagingRoot, 'resource-pack.json'), internalManifest, {spaces: 2});

    requiredFiles.forEach(relativePath => {
        if (!fs.existsSync(path.join(stagingRoot, relativePath))) {
            throw new Error(`${id}: incomplete pack, missing ${relativePath}`);
        }
    });

    const installedBytes = directorySize(stagingRoot);
    if (maximumInstalledBytes && installedBytes > maximumInstalledBytes) {
        throw new Error(`${id}: installed size ${installedBytes} exceeds ${maximumInstalledBytes}`);
    }
    fs.ensureDirSync(OUTPUT_ROOT);
    fs.removeSync(archivePath);
    await tar.c({
        cwd: stagingRoot,
        file: archivePath,
        gzip: {level: 9},
        portable: true
    }, fs.readdirSync(stagingRoot).sort());

    const sha256 = await sha256File(archivePath);
    const archiveBytes = fs.statSync(archivePath).size;
    const releaseTag = `${releaseTagPrefix}-v${version}`;
    const fragment = Object.assign({
        schemaVersion: 1,
        id,
        displayName,
        description,
        version,
        minimumVersion: version,
        compatibilityVersion,
        requiredFiles,
        validation,
        variants: {
            [variantKey]: {
                url: `https://github.com/${RELEASE_REPOSITORY}/releases/download/${releaseTag}/${archiveName}`,
                sha256,
                archiveBytes,
                installedBytes,
                requiredFiles
            }
        }
    }, extraManifest);
    const fragmentPath = path.join(OUTPUT_ROOT, `${id}-${variantKey}.json`);
    fs.writeJsonSync(fragmentPath, fragment, {spaces: 2});
    fs.writeFileSync(path.join(OUTPUT_ROOT, `${archiveName}.sha256`), `${sha256}  ${archiveName}${os.EOL}`);
    fs.removeSync(stagingRoot);
    console.log(`Created ${path.relative(ROOT, archivePath)} (${archiveBytes} bytes)`);
    console.log(`Installed size ${installedBytes} bytes; SHA-256 ${sha256}`);
};

module.exports = {
    OUTPUT_ROOT,
    ROOT,
    copyRequired,
    finalizePack,
    readOption
};
