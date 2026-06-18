const displayLcd = formatMessage => ({
    name: formatMessage({
        id: 'displayLcd.name',
        default: 'LCD 16x2'
    }),
    extensionId: 'displayLcd',
    version: '1.0.0',
    supportDevice: ['arduinoUno', 'arduinoNano', 'arduinoLeonardo', 'arduinoUnoR4Wifi', 'arduinoEsp32'],
    author: 'Dogoblock',
    iconURL: `assets/displayLcd.png`,
    description: formatMessage({
        id: 'displayLcd.description',
        default: 'Control a 16x2 parallel LCD display.'
    }),
    featured: true,
    blocks: 'blocks.js',
    generator: 'generator.js',
    toolbox: 'toolbox.js',
    translations: 'translations.js',
    library: 'lib',
    official: true,
    tags: ['display'],
    helpLink: 'https://wiki.openblock.cc'
});

module.exports = displayLcd;
