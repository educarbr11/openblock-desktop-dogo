const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

const {OUTPUT_ROOT, ROOT, copyRequired, finalizePack, readOption} = require('./resource-pack-build-utils');

const platform = readOption('platform', process.platform);
const arch = readOption('arch', process.arch);
const version = readOption('version', '1.0.0');
const coreVersion = readOption('core-version', '1.3.2');
const variantKey = `${platform}-${arch}`;
const sourceArduino = path.join(ROOT, 'tools', 'Arduino');
const stagingRoot = path.join(OUTPUT_ROOT, `.arduino-r4-${variantKey}.staging`);
const stagingArduino = path.join(stagingRoot, 'tools', 'Arduino');
const cliName = platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli';
const requiredFiles = [
    `tools/Arduino/${cliName}`,
    `tools/Arduino/packages/arduino/hardware/renesas_uno/${coreVersion}/platform.txt`,
    'tools/Arduino/packages/arduino/tools/arm-none-eabi-gcc/7-2017q4/bin',
    'tools/Arduino/packages/arduino/tools/bossac/1.9.1-arduino5',
    'tools/Arduino/packages/arduino/tools/dfu-util/0.11.0-arduino5'
];

const run = (executable, args) => {
    const result = spawnSync(executable, args, {encoding: 'utf8'});
    if (result.error || result.status !== 0) {
        throw new Error(((result.error && result.error.message) || result.stderr || result.stdout).trim());
    }
};

const copyArduinoFile = name => copyRequired(
    path.join(sourceArduino, name), path.join(stagingArduino, name), 'Arduino R4 resource pack'
);

const pruneDebugTools = () => {
    const toolchainRoot = path.join(
        stagingArduino,
        'packages',
        'arduino',
        'tools',
        'arm-none-eabi-gcc',
        '7-2017q4'
    );
    ['arm-none-eabi-gdb', 'arm-none-eabi-gdb-py', 'arm-none-eabi-gdb.exe', 'arm-none-eabi-gdb-py.exe']
        .forEach(name => fs.removeSync(path.join(toolchainRoot, 'bin', name)));
    fs.removeSync(path.join(toolchainRoot, 'share', 'gdb'));
    fs.removeSync(path.join(toolchainRoot, 'share', 'doc'));
};

const validateCompile = () => {
    const cli = path.join(stagingArduino, cliName);
    if (platform !== 'win32') fs.chmodSync(cli, 0o755);
    const validationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dogoblock-r4-'));
    const configPath = path.join(validationRoot, 'arduino-cli.yaml');
    const sketchPath = path.join(validationRoot, 'sketch');
    fs.ensureDirSync(sketchPath);
    fs.writeFileSync(path.join(sketchPath, 'sketch.ino'), [
        '#include <Arduino.h>',
        'void setup() { pinMode(13, OUTPUT); }',
        'void loop() { digitalWrite(13, HIGH); delay(50); digitalWrite(13, LOW); delay(50); }',
        ''
    ].join('\n'));
    try {
        run(cli, ['config', 'init', '--dest-file', configPath]);
        const directories = {
            data: stagingArduino,
            downloads: path.join(stagingArduino, 'staging'),
            user: stagingArduino
        };
        Object.keys(directories).forEach(name => run(cli, [
            'config', 'set', `directories.${name}`, directories[name], '--config-file', configPath
        ]));
        ['arduino:renesas_uno:unor4wifi', 'arduino:renesas_uno:minima'].forEach(fqbn => run(cli, [
            'compile', '--fqbn', fqbn, '--libraries', path.join(stagingArduino, 'libraries'),
            '--build-path', path.join(validationRoot, fqbn.split(':').pop()), '--config-file', configPath, sketchPath
        ]));
    } finally {
        fs.removeSync(validationRoot);
    }
};

const build = async () => {
    if (!['linux', 'win32'].includes(platform) || arch !== 'x64') {
        throw new Error(`Arduino R4 resource pack: unsupported target ${variantKey}`);
    }
    fs.removeSync(stagingRoot);
    fs.ensureDirSync(stagingArduino);
    [cliName, 'LICENSE.txt', 'package_index.json', 'library_index.json'].forEach(copyArduinoFile);
    copyRequired(
        path.join(sourceArduino, 'libraries'),
        path.join(stagingArduino, 'libraries'),
        'Arduino R4 resource pack'
    );
    copyRequired(path.join(sourceArduino, 'packages', 'builtin'),
        path.join(stagingArduino, 'packages', 'builtin'), 'Arduino R4 resource pack');
    copyRequired(path.join(sourceArduino, 'packages', 'arduino', 'hardware', 'renesas_uno', coreVersion),
        path.join(stagingArduino, 'packages', 'arduino', 'hardware', 'renesas_uno', coreVersion),
        'Arduino R4 resource pack');
    ['arm-none-eabi-gcc', 'bossac', 'dfu-util'].forEach(tool => copyRequired(
        path.join(sourceArduino, 'packages', 'arduino', 'tools', tool),
        path.join(stagingArduino, 'packages', 'arduino', 'tools', tool),
        'Arduino R4 resource pack'
    ));
    pruneDebugTools();
    fs.ensureDirSync(path.join(stagingArduino, 'staging'));
    validateCompile();
    await finalizePack({
        id: 'arduino-r4',
        displayName: 'Suporte ao Arduino R4',
        description: 'Compilador e ferramentas locais para Arduino Uno R4 WiFi. Funciona offline apos instalar.',
        version,
        compatibilityVersion: `arduino-renesas-${coreVersion}`,
        platform,
        arch,
        stagingRoot,
        archivePrefix: 'dogoblock-arduino-r4-pack',
        releaseTagPrefix: 'arduino-r4-pack',
        requiredFiles,
        validation: {
            type: 'arduino',
            coreId: 'arduino:renesas_uno',
            boardFqbns: ['arduino:renesas_uno:unor4wifi', 'arduino:renesas_uno:minima']
        },
        maximumInstalledBytes: 600 * 1024 * 1024,
        extraManifest: {coreVersion}
    });
};

build().catch(error => {
    fs.removeSync(stagingRoot);
    console.error(error.stack || error);
    process.exitCode = 1;
});
