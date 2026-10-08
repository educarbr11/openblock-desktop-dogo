const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

const directorySize = target => {
    if (!fs.existsSync(target)) return 0;
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) return 0;
    if (!stat.isDirectory()) return stat.size;
    return fs.readdirSync(target).reduce((total, child) => total + directorySize(path.join(target, child)), 0);
};

const findFile = (target, predicate) => {
    if (!fs.existsSync(target)) return null;
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) return null;
    if (!stat.isDirectory()) return predicate(target) ? target : null;
    for (const child of fs.readdirSync(target)) {
        const match = findFile(path.join(target, child), predicate);
        if (match) return match;
    }
    return null;
};

module.exports = context => {
    const appRoot = context.appOutDir;
    const resourcesRoot = path.join(appRoot, 'resources');
    const archivePath = path.join(resourcesRoot, 'app.asar');
    const forbiddenPaths = [
        path.join(appRoot, 'tools', 'Arduino', 'packages', 'esp32'),
        path.join(appRoot, 'tools', 'Arduino', 'packages', 'arduino', 'hardware', 'renesas_uno'),
        path.join(appRoot, 'tools', 'Python'),
        path.join(appRoot, 'static', 'ml-vendor'),
        path.join(appRoot, 'resources', 'app.asar.unpacked', 'node_modules', 'openblock-link', 'tools'),
        path.join(appRoot, 'resources', 'app.asar.unpacked', 'node_modules', 'openblock-link', 'firmwares')
    ];
    forbiddenPaths.forEach(candidate => {
        if (fs.existsSync(candidate)) {
            throw new Error(`Packaged Desktop contains a forbidden duplicated resource: ${candidate}`);
        }
    });
    const staticAssets = path.join(resourcesRoot, 'static', 'assets');
    if (!fs.existsSync(staticAssets) || fs.readdirSync(staticAssets).length === 0) {
        throw new Error('Packaged Desktop is missing the offline sprite and backdrop assets.');
    }
    const publishedSourceMap = findFile(appRoot, candidate => candidate.endsWith('.map'));
    if (publishedSourceMap) {
        throw new Error(`Packaged Desktop contains a source map: ${publishedSourceMap}`);
    }

    if (!fs.existsSync(archivePath)) throw new Error(`Packaged Desktop is missing ${archivePath}`);
    const archiveBytes = fs.statSync(archivePath).size;
    const maximumArchiveBytes = Number(process.env.DOGOBLOCK_MAX_ASAR_BYTES) || (350 * 1024 * 1024);
    if (archiveBytes > maximumArchiveBytes) {
        throw new Error(`app.asar is unexpectedly large: ${archiveBytes} bytes (limit ${maximumArchiveBytes} bytes).`);
    }

    const archiveEntries = asar.listPackage(archivePath).map(entry => entry.replace(/^\//, ''));
    const archiveEntrySet = new Set(archiveEntries);
    const rendererAssetsRoot = path.resolve(__dirname, '..', 'dist', 'renderer', 'renderer-assets');
    if (!fs.existsSync(rendererAssetsRoot)) {
        throw new Error('Renderer build output is missing its generated UI assets.');
    }
    const rendererAssets = fs.readdirSync(rendererAssetsRoot)
        .filter(entry => fs.statSync(path.join(rendererAssetsRoot, entry)).isFile());
    if (rendererAssets.length === 0) {
        throw new Error('Renderer build output contains no generated UI assets.');
    }
    const missingRendererAsset = rendererAssets.find(entry => !archiveEntrySet.has(`renderer-assets/${entry}`));
    if (missingRendererAsset) {
        throw new Error(`Packaged Desktop is missing renderer asset: ${missingRendererAsset}`);
    }
    const requiredRuntimeEntries = [
        'node_modules/react/package.json',
        'node_modules/react-dom/package.json',
        'node_modules/@sentry/react/package.json',
        'node_modules/lucide-react/package.json'
    ];
    requiredRuntimeEntries.forEach(entry => {
        if (archiveEntries.indexOf(entry) === -1) {
            throw new Error(`Packaged Desktop is missing renderer runtime dependency: ${entry}`);
        }
    });
    const forbiddenArchivePatterns = [
        /(^|\/)tmp\//,
        /(^|\/)tools\/Python\//,
        /(^|\/)static\/ml-vendor\//,
        /(^|\/)packages\/esp32\//,
        /(^|\/)hardware\/renesas_uno\//,
        /\.map$/
    ];
    archiveEntries.forEach(entry => {
        if (forbiddenArchivePatterns.some(pattern => pattern.test(entry))) {
            throw new Error(`Packaged Desktop app.asar contains forbidden content: ${entry}`);
        }
    });

    const defaultMaximumBytes = 1100 * 1024 * 1024;
    const maximumBytes = Number(process.env.DOGOBLOCK_MAX_PACKAGED_BYTES) || defaultMaximumBytes;
    const packagedBytes = directorySize(appRoot);
    if (packagedBytes > maximumBytes) {
        throw new Error(
            `Packaged Desktop is unexpectedly large: ${packagedBytes} bytes (limit ${maximumBytes} bytes).`
        );
    }
    console.log(
        `Packaged Desktop resource verification passed (${packagedBytes} bytes; app.asar ${archiveBytes} bytes).`
    );
};
