const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const resolveUsbPackage = () => {
    const resolutionPaths = [
        path.join(root, 'node_modules', 'openblock-link'),
        root
    ];

    for (const resolutionPath of resolutionPaths) {
        try {
            return require.resolve('usb/package.json', {paths: [resolutionPath]});
        } catch (error) {
            if (error.code !== 'MODULE_NOT_FOUND') throw error;
        }
    }

    return null;
};

const prepareUsbNativeBuild = () => {
    const usbPackage = resolveUsbPackage();
    if (!usbPackage) {
        console.log('Optional USB native dependency is not installed; skipping its C++17 build preparation.');
        return;
    }

    const bindingFile = path.join(path.dirname(usbPackage), 'binding.gyp');
    if (!fs.existsSync(bindingFile)) {
        throw new Error(`USB native dependency is missing binding.gyp: ${bindingFile}`);
    }

    const currentBinding = fs.readFileSync(bindingFile, 'utf8');
    const preparedBinding = currentBinding
        .replace(/-std=c\+\+14/g, '-std=c++17')
        .replace(/-std=c\+\+1y/g, '-std=c++17')
        .replace(/-std=gnu\+\+14/g, '-std=gnu++17')
        .replace(/-std=gnu\+\+1y/g, '-std=gnu++17');

    if (!/-std=(?:gnu\+\+|c\+\+)17/.test(preparedBinding)) {
        throw new Error(`USB native dependency does not define a supported C++ standard: ${bindingFile}`);
    }
    if (preparedBinding === currentBinding) {
        console.log(`USB native build already uses C++17: ${bindingFile}`);
    } else {
        fs.writeFileSync(bindingFile, preparedBinding);
        console.log(`Updated USB native build to C++17: ${bindingFile}`);
    }
};

if (require.main === module) prepareUsbNativeBuild();

module.exports = prepareUsbNativeBuild;
