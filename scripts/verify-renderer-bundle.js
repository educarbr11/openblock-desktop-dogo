const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rendererConfigPath = path.join(root, 'dist', 'webpack.renderer.js');
const rendererDirectory = path.join(root, 'dist', 'renderer');

if (!fs.existsSync(rendererConfigPath) || !fs.existsSync(rendererDirectory)) {
    throw new Error('Renderer build output was not found. Run the Desktop compilation first.');
}

const rendererFiles = fs.readdirSync(rendererDirectory)
    .filter(file => file.endsWith('.js'));
const rendererConfig = fs.readFileSync(rendererConfigPath, 'utf8');
const rendererSources = rendererFiles.map(file =>
    fs.readFileSync(path.join(rendererDirectory, file), 'utf8')
);
const bundledDependencies = ['lucide-react', '@sentry/react'];

bundledDependencies.forEach(dependency => {
    if (rendererConfig.includes(`'${dependency}'`) || rendererConfig.includes(`"${dependency}"`)) {
        throw new Error(`${dependency} must be bundled with the renderer, not packaged as an external dependency.`);
    }

    const hasRuntimeRequire = rendererSources.some(source =>
        source.includes(`external "${dependency}"`) ||
        source.includes(`external '${dependency}'`) ||
        source.includes(`require("${dependency}")`) ||
        source.includes(`require('${dependency}')`)
    );
    if (hasRuntimeRequire) {
        throw new Error(`Renderer output still contains a runtime require for ${dependency}.`);
    }
});

console.log('Renderer dependencies are bundled correctly.'); // eslint-disable-line no-console
