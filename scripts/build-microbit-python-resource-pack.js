const fs = require('fs-extra');
const path = require('path');
const {spawnSync} = require('child_process');

const {OUTPUT_ROOT, ROOT, copyRequired, finalizePack, readOption} = require('./resource-pack-build-utils');

const platform = readOption('platform', process.platform);
const arch = readOption('arch', process.arch);
const version = readOption('version', '1.0.0');
const variantKey = `${platform}-${arch}`;
const sourcePython = path.join(ROOT, 'tools', 'Python');
const stagingRoot = path.join(OUTPUT_ROOT, `.microbit-python-${variantKey}.staging`);
const stagingPython = path.join(stagingRoot, 'tools', 'Python');
const executable = platform === 'win32' ? 'tools/Python/python.exe' : 'tools/Python/bin/python3';
const requiredFiles = [executable];

const findSitePackages = root => [
    path.join(root, 'Lib', 'site-packages'),
    path.join(root, 'lib', 'python3.11', 'site-packages')
].find(candidate => fs.existsSync(candidate));

const keepMicrobitPackages = () => {
    const sourceSitePackages = findSitePackages(sourcePython);
    const targetSitePackages = findSitePackages(stagingPython);
    if (!sourceSitePackages || !targetSitePackages) throw new Error('Python site-packages directory was not found.');
    fs.emptyDirSync(targetSitePackages);
    ['microfs.py', 'uflash.py', 'serial', 'microfs-1.4.5.dist-info', 'uflash-2.0.0.dist-info',
        'pyserial-3.5.dist-info'].forEach(name => {
        const source = path.join(sourceSitePackages, name);
        if (fs.existsSync(source)) copyRequired(source, path.join(targetSitePackages, name), 'micro:bit Python pack');
    });
    requiredFiles.push(path.relative(stagingRoot, path.join(targetSitePackages, 'microfs.py')).replace(/\\/g, '/'));
    requiredFiles.push(path.relative(stagingRoot, path.join(targetSitePackages, 'uflash.py')).replace(/\\/g, '/'));
    requiredFiles.push(path.relative(stagingRoot, path.join(targetSitePackages, 'serial')).replace(/\\/g, '/'));
};

const prunePython = () => {
    ['Doc', 'include', 'Include', 'libs', 'Scripts', 'share', 'tcl', 'Tools']
        .forEach(name => fs.removeSync(path.join(stagingPython, name)));
    fs.removeSync(path.join(stagingPython, 'lib', 'libpython3.11.a'));
    fs.removeSync(path.join(stagingPython, 'lib', 'pkgconfig'));
    const stdlib = platform === 'win32' ? path.join(stagingPython, 'Lib') :
        path.join(stagingPython, 'lib', 'python3.11');
    ['test', 'idlelib', 'tkinter', 'turtledemo', 'ensurepip', 'config-3.11-x86_64-linux-gnu']
        .forEach(name => fs.removeSync(path.join(stdlib, name)));
    if (platform !== 'win32') {
        const sourceExecutable = path.join(stagingPython, 'bin', 'python3.11');
        const compactBin = `${path.join(stagingPython, 'bin')}.compact`;
        fs.ensureDirSync(compactBin);
        fs.moveSync(sourceExecutable, path.join(compactBin, 'python3.11'));
        fs.removeSync(path.join(stagingPython, 'bin'));
        fs.moveSync(compactBin, path.join(stagingPython, 'bin'));
        fs.writeFileSync(path.join(stagingPython, 'bin', 'python3'), [
            '#!/bin/sh',
            'exec "$(dirname "$0")/python3.11" "$@"',
            ''
        ].join('\n'), {mode: 0o755});
    }
    const removeCaches = directory => {
        if (!fs.existsSync(directory)) return;
        fs.readdirSync(directory, {withFileTypes: true}).forEach(entry => {
            const entryPath = path.join(directory, entry.name);
            if (entry.name === '__pycache__' || entry.name.endsWith('.pyc')) fs.removeSync(entryPath);
            else if (entry.isDirectory()) removeCaches(entryPath);
        });
    };
    removeCaches(stagingPython);
};

const validate = () => {
    const python = path.join(stagingRoot, executable);
    if (platform !== 'win32') fs.chmodSync(python, 0o755);
    [['-m', 'microfs', '--help'], ['-m', 'uflash', '--help']].forEach(args => {
        const result = spawnSync(python, args, {encoding: 'utf8'});
        if (result.error || result.status !== 0) {
            throw new Error(((result.error && result.error.message) || result.stderr || result.stdout).trim());
        }
    });
};

const build = async () => {
    if (!['linux', 'win32'].includes(platform) || arch !== 'x64') {
        throw new Error(`micro:bit Python resource pack: unsupported target ${variantKey}`);
    }
    fs.removeSync(stagingRoot);
    fs.ensureDirSync(stagingRoot);
    copyRequired(sourcePython, stagingPython, 'micro:bit Python resource pack');
    keepMicrobitPackages();
    prunePython();
    validate();
    await finalizePack({
        id: 'microbit-python',
        displayName: 'Python para programar o micro:bit',
        description: 'Runtime local usado para enviar programas MicroPython ao micro:bit. ' +
            'O modo palco nao precisa dele.',
        version,
        compatibilityVersion: 'cpython-3.11-microbit-v1',
        platform,
        arch,
        stagingRoot,
        archivePrefix: 'dogoblock-microbit-python-pack',
        releaseTagPrefix: 'microbit-python-pack',
        requiredFiles,
        validation: {
            type: 'python',
            executable,
            commands: [['-m', 'microfs', '--help'], ['-m', 'uflash', '--help']]
        },
        maximumInstalledBytes: 120 * 1024 * 1024
    });
};

build().catch(error => {
    fs.removeSync(stagingRoot);
    console.error(error.stack || error);
    process.exitCode = 1;
});
