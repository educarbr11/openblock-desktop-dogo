const fs = require('fs');
const path = require('path');

const directorySize = target => {
    if (!fs.existsSync(target)) return 0;
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) return 0;
    if (!stat.isDirectory()) return stat.size;
    return fs.readdirSync(target).reduce((total, child) => total + directorySize(path.join(target, child)), 0);
};

module.exports = context => {
    const appRoot = context.appOutDir;
    const forbiddenPaths = [
        path.join(appRoot, 'tools', 'Arduino', 'packages', 'esp32'),
        path.join(appRoot, 'resources', 'app.asar.unpacked', 'node_modules', 'openblock-link', 'tools'),
        path.join(appRoot, 'resources', 'app.asar.unpacked', 'node_modules', 'openblock-link', 'firmwares')
    ];
    forbiddenPaths.forEach(candidate => {
        if (fs.existsSync(candidate)) {
            throw new Error(`Packaged Desktop contains a forbidden duplicated resource: ${candidate}`);
        }
    });

    const maximumBytes = Number(process.env.DOGOBLOCK_MAX_PACKAGED_BYTES) || (3 * 1024 * 1024 * 1024);
    const packagedBytes = directorySize(appRoot);
    if (packagedBytes > maximumBytes) {
        throw new Error(
            `Packaged Desktop is unexpectedly large: ${packagedBytes} bytes (limit ${maximumBytes} bytes).`
        );
    }
    console.log(`Packaged Desktop resource verification passed (${packagedBytes} bytes).`);
};
