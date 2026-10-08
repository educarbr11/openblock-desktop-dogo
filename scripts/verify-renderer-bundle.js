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

const rendererSource = rendererSources.join('\n');
const reactImplementationCount = (
    rendererSource.match(/\* react\.(?:development|production\.min)\.js/g) || []
).length;
const reactDomImplementationCount = (
    rendererSource.match(/\* react-dom\.(?:development|production\.min)\.js/g) || []
).length;
const nestedReactPath = /openblock-gui\/node_modules\/(?:react|react-dom)\/(?:index|cjs\/react(?:-dom)?)\.js/;

if (reactImplementationCount !== 1 || reactDomImplementationCount !== 1 || nestedReactPath.test(rendererSource)) {
    throw new Error(
        'Renderer must contain one shared React/ReactDOM instance. ' +
        `Found React=${reactImplementationCount}, ReactDOM=${reactDomImplementationCount}, ` +
        `nested GUI copy=${nestedReactPath.test(rendererSource)}.`
    );
}

const rendererAssetReferences = new Set(
    rendererSource.match(/renderer-assets\/[a-f0-9]+\.(?:gif|jpg|png|svg|ttf|wav)/g) || []
);
const legacyAssetReference = rendererSource.match(/static\/assets\/[a-f0-9]+\.(?:gif|jpg|png|svg|ttf|wav)/);
if (rendererAssetReferences.size === 0) {
    throw new Error('Renderer output does not reference any generated UI assets.');
}
if (legacyAssetReference) {
    throw new Error(`Renderer output contains a legacy UI asset path: ${legacyAssetReference[0]}`);
}
rendererAssetReferences.forEach(reference => {
    if (!fs.existsSync(path.join(rendererDirectory, reference))) {
        throw new Error(`Renderer output references a missing UI asset: ${reference}`);
    }
});

console.log('Renderer dependencies are bundled correctly.'); // eslint-disable-line no-console
