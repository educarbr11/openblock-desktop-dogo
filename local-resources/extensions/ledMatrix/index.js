const ledMatrix = formatMessage => ({
    name: formatMessage({
        id: 'ledMatrix.name',
        default: 'LED Matrix'
    }),
    extensionId: 'ledMatrix',
    version: '1.0.0',
    supportDevice: ['arduinoUno', 'arduinoNano', 'arduinoLeonardo', 'arduinoUnoR4Wifi', 'arduinoEsp32'],
    author: 'Dogoblock',
    iconURL: `assets/ledMatrix.png`,
    description: formatMessage({
        id: 'ledMatrix.description',
        default: 'Control 8x8 and 5x5 MAX7219 LED matrices.'
    }),
    featured: true,
    blocks: 'blocks.js',
    generator: 'generator.js',
    toolbox: 'toolbox.js',
    translations: 'translations.js',
    official: true,
    tags: ['display'],
    helpLink: 'https://wiki.openblock.cc'
});

module.exports = ledMatrix;
