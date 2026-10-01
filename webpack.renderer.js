const fs = require('fs');
const path = require('path');

const CopyWebpackPlugin = require('copy-webpack-plugin');
const {sentryWebpackPlugin} = require('@sentry/webpack-plugin');

const makeConfig = require('./webpack.makeConfig.js');

const localOpenBlockVMPath = process.env.OPENBLOCK_VM_PATH ?
    path.resolve(process.env.OPENBLOCK_VM_PATH) :
    path.resolve(__dirname, '..', 'openblock-vm');
const localOpenBlockGUIPath = process.env.OPENBLOCK_GUI_PATH ?
    path.resolve(process.env.OPENBLOCK_GUI_PATH) :
    path.resolve(__dirname, '..', 'openblock-gui');
const hasLocalOpenBlockVM = (() => {
    try {
        require.resolve(path.join(localOpenBlockVMPath, 'package.json'));
        return true;
    } catch (e) {
        return false;
    }
})();
const hasLocalOpenBlockGUI = (() => {
    try {
        require.resolve(path.join(localOpenBlockGUIPath, 'package.json'));
        return true;
    } catch (e) {
        return false;
    }
})();

class RemoveSourceMapsPlugin {
    apply (compiler) {
        compiler.hooks.done.tap('RemoveSourceMapsPlugin', () => {
            const removeMaps = directory => {
                if (!fs.existsSync(directory)) return;
                fs.readdirSync(directory, {withFileTypes: true}).forEach(entry => {
                    const entryPath = path.join(directory, entry.name);
                    if (entry.isDirectory()) removeMaps(entryPath);
                    else if (entry.name.endsWith('.map')) fs.unlinkSync(entryPath);
                });
            };
            removeMaps(compiler.options.output.path);
        });
    }
}

const createSentryWebpackPlugins = () => {
    if (process.env.NODE_ENV !== 'production') return [];
    if (!process.env.SENTRY_AUTH_TOKEN || !process.env.SENTRY_ORG ||
        !process.env.SENTRY_PROJECT || !process.env.SENTRY_RELEASE) {
        return [new RemoveSourceMapsPlugin()];
    }

    const rendererOutput = path.resolve(__dirname, 'dist', 'renderer');
    return [sentryWebpackPlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        release: {name: process.env.SENTRY_RELEASE},
        sourcemaps: {
            assets: path.join(rendererOutput, '**/*.js'),
            filesToDeleteAfterUpload: path.join(rendererOutput, '**/*.js.map')
        },
        telemetry: false
    })];
};

// Fixed the issue that when using link to local gui package in node16, an error message appears saying that the
// blocks vm package in gui cannot be found.
const getModulePath = moduleName => {
    if (moduleName === 'openblock-vm' && hasLocalOpenBlockVM) {
        return localOpenBlockVMPath;
    }
    if (moduleName === 'openblock-gui' && hasLocalOpenBlockGUI) {
        return localOpenBlockGUIPath;
    }

    try {
        return path.dirname(require.resolve(`${moduleName}/package.json`));
    } catch (e) {
        try {
            const openblockGuiPath = path.dirname(require.resolve('openblock-gui/package.json'));
            return path.resolve(openblockGuiPath, 'node_modules', moduleName);
        } catch (err) {
            throw new Error(`Module ${moduleName} could not be resolved. Ensure it is installed or linked properly.`);
        }
    }
};

module.exports = defaultConfig =>
    makeConfig(
        defaultConfig,
        {
            name: 'renderer',
            useReact: true,
            disableDefaultRulesForExtensions: ['js', 'jsx', 'css', 'svg', 'png', 'wav', 'gif', 'jpg', 'ttf'],
            babelPaths: [
                path.resolve(__dirname, 'src', 'renderer'),
                ...(hasLocalOpenBlockVM ? [path.join(localOpenBlockVMPath, 'src')] : []),
                ...(hasLocalOpenBlockGUI ? [path.join(localOpenBlockGUIPath, 'src')] : []),
                /node_modules[\\/]+scratch-[^\\/]+[\\/]+src/,
                /node_modules[\\/]+openblock-[^\\/]+[\\/]+src/,
                /node_modules[\\/]+pify/,
                /node_modules[\\/]+@vernier[\\/]+godirect/
            ],
            plugins: [
                new CopyWebpackPlugin([{
                    from: path.join(getModulePath('openblock-blocks'), 'media'),
                    to: 'static/blocks-media'
                }]),
                new CopyWebpackPlugin([{
                    from: 'extension-worker.{js,js.map}',
                    context: path.join(getModulePath('openblock-vm'), 'dist', 'web')
                }]),
                new CopyWebpackPlugin([{
                    from: path.join(getModulePath('openblock-gui'), 'src', 'lib', 'libraries', '*.json'),
                    to: 'static/libraries',
                    flatten: true
                }]),
                new CopyWebpackPlugin([{
                    from: path.join(getModulePath('openblock-gui'), 'static', 'ml-vendor'),
                    to: 'static/ml-vendor'
                }])
            ].concat(createSentryWebpackPlugins())
        }
    );
