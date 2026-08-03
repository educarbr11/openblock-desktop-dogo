const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXPECTED_OWNER = 'educarbr11';
const EXPECTED_REPO = 'openblock-desktop-dogo';
const verifyPackagedOutput = process.argv.includes('--packaged');

const fail = message => {
    throw new Error(`Update configuration is invalid: ${message}`);
};

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const repositoryUrl = packageJson.repository && packageJson.repository.url;
if (!repositoryUrl || !repositoryUrl.includes(`${EXPECTED_OWNER}/${EXPECTED_REPO}`)) {
    fail(`package.json repository must point to ${EXPECTED_OWNER}/${EXPECTED_REPO}`);
}

const builderConfig = fs.readFileSync(path.join(ROOT, 'electron-builder.yaml'), 'utf8');
if (!/^\s*owner:\s*educarbr11\s*$/m.test(builderConfig) ||
    !/^\s*repo:\s*openblock-desktop-dogo\s*$/m.test(builderConfig)) {
    fail('electron-builder publish owner/repo is missing or incorrect');
}
if (!/^\s*-\s*AppImage\s*$/m.test(builderConfig)) {
    fail('Linux AppImage target is required for automatic updates');
}

const findFiles = (directory, fileName, depth = 0) => {
    if (!fs.existsSync(directory) || depth > 4) return [];
    return fs.readdirSync(directory, {withFileTypes: true}).reduce((files, entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return files.concat(findFiles(entryPath, fileName, depth + 1));
        if (entry.name === fileName) files.push(entryPath);
        return files;
    }, []);
};

const distDirectory = path.join(ROOT, 'dist');
if (verifyPackagedOutput) {
    const packagedConfigs = findFiles(distDirectory, 'app-update.yml');
    if (packagedConfigs.length === 0) {
        fail('packaged app-update.yml was not generated');
    }
    for (const configPath of packagedConfigs) {
        const config = fs.readFileSync(configPath, 'utf8');
        if (!new RegExp(`^owner: ${EXPECTED_OWNER}$`, 'm').test(config) ||
            !new RegExp(`^repo: ${EXPECTED_REPO}$`, 'm').test(config)) {
            fail(`${path.relative(ROOT, configPath)} points to the wrong GitHub repository`);
        }
    }

    if (process.platform === 'linux') {
        const linuxMetadataPath = path.join(distDirectory, 'latest-linux.yml');
        if (!fs.existsSync(linuxMetadataPath)) fail('latest-linux.yml was not generated');
        const linuxMetadata = fs.readFileSync(linuxMetadataPath, 'utf8');
        if (!/\.AppImage(?:\s|$)/m.test(linuxMetadata)) {
            fail('latest-linux.yml does not contain an AppImage update');
        }
        const appImageExists = fs.readdirSync(distDirectory).some(file => file.endsWith('.AppImage'));
        if (!appImageExists) fail('Linux AppImage artifact was not generated');
    }

    if (process.platform === 'win32') {
        const windowsMetadataPath = path.join(distDirectory, 'latest.yml');
        if (!fs.existsSync(windowsMetadataPath)) fail('latest.yml was not generated');
        const windowsMetadata = fs.readFileSync(windowsMetadataPath, 'utf8');
        if (!/\.exe(?:\s|$)/m.test(windowsMetadata)) {
            fail('latest.yml does not contain a Windows installer');
        }
    }
}

console.log(`Update configuration verified for ${EXPECTED_OWNER}/${EXPECTED_REPO}.`);
