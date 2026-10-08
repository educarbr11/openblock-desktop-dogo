const fs = require('fs-extra');
const path = require('path');

const {OUTPUT_ROOT, ROOT, copyRequired, finalizePack, readOption} = require('./resource-pack-build-utils');

const version = readOption('version', '1.0.0');
const guiRoot = process.env.OPENBLOCK_GUI_PATH ? path.resolve(process.env.OPENBLOCK_GUI_PATH) :
    path.resolve(ROOT, '..', 'openblock-gui');
const source = path.join(guiRoot, 'static', 'ml-vendor');
const stagingRoot = path.join(OUTPUT_ROOT, '.ai-ml-universal.staging');
const requiredFiles = [
    'tfjs/4.22.0/tf.min.js',
    'knn-classifier/1.2.6/knn-classifier.min.js',
    'mobilenet/2.1.1/mobilenet.min.js',
    'mobilenet/model/model.json',
    'mediapipe-hands/0.4.1675469240/hands.js',
    'mediapipe-hands/0.4.1675469240/hands_solution_simd_wasm_bin.wasm',
    'hand-pose-detection/2.0.0/hand-pose-detection.min.js'
];

const build = async () => {
    fs.removeSync(stagingRoot);
    fs.ensureDirSync(stagingRoot);
    copyRequired(source, stagingRoot, 'AI/ML resource pack');
    await finalizePack({
        id: 'ai-ml',
        displayName: 'Recursos de IA e aprendizagem de maquina',
        description: 'Modelos locais para Aprendizagem de Maquina e Deteccao de Maos. Funciona offline apos instalar.',
        version,
        compatibilityVersion: 'ml-vendor-v1',
        platform: 'universal',
        arch: 'universal',
        stagingRoot,
        archivePrefix: 'dogoblock-ai-ml-pack',
        releaseTagPrefix: 'ai-ml-pack',
        requiredFiles,
        validation: {type: 'assets'},
        maximumInstalledBytes: 45 * 1024 * 1024
    });
};

build().catch(error => {
    fs.removeSync(stagingRoot);
    console.error(error.stack || error);
    process.exitCode = 1;
});
