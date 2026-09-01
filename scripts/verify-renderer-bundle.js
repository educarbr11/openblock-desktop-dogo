const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rendererConfigPath = path.join(root, 'dist', 'webpack.renderer.js');
const rendererDirectory = path.join(root, 'dist', 'renderer');

if (!fs.existsSync(rendererConfigPath) || !fs.existsSync(rendererDirectory)) {
    throw new Error('Renderer build output was not found. Run the Desktop compilation first.');
}

const rendererConfig = fs.readFileSync(rendererConfigPath, 'utf8');
if (/externals:\s*\[[\s\S]*?['"]lucide-react['"]/.test(rendererConfig)) {
    throw new Error('lucide-react must be bundled with the renderer, not packaged as an external dependency.');
}

const rendererFiles = fs.readdirSync(rendererDirectory)
    .filter(file => file.endsWith('.js'));
const hasExternalLucide = rendererFiles.some(file => {
    const source = fs.readFileSync(path.join(rendererDirectory, file), 'utf8');
    return /external ["']lucide-react["']/.test(source) ||
        /require\(["']lucide-react["']\)/.test(source);
});

if (hasExternalLucide) {
    throw new Error('Renderer output still contains a runtime require for lucide-react.');
}

console.log('Renderer dependencies are bundled correctly.'); // eslint-disable-line no-console
