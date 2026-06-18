// This file was automatically generated. Do not modify.
/* eslint-disable func-style */
/* eslint-disable require-jsdoc */
/* eslint-disable quotes */
/* eslint-disable quote-props */
/* eslint-disable dot-notation */
/* eslint-disable max-len */
function getInterfaceTranslations () {
    return {
        "en": {
            "displayLcd.name": "LCD 16x2",
            "displayLcd.description": "Control a 16x2 parallel LCD display."
        },
        "pt-br": {
            "displayLcd.name": "LCD 16x2",
            "displayLcd.description": "Controle um display LCD 16x2 paralelo."
        }
    };
}

function registerScratchExtensionTranslations () {
    return {};
}

function registerBlocksMessages (Blockly) {
    Object.assign(Blockly.ScratchMsgs.locales["en"],
        {
            "DISPLAYLCD_CATEGORY": "LCD 16x2",
            "DISPLAYLCD_CLEAR": "clear LCD",
            "DISPLAYLCD_INIT": "init LCD 16x2 RS %1 E %2 D4 %3 D5 %4 D6 %5 D7 %6",
            "DISPLAYLCD_INIT_DEFAULT": "init LCD 16x2 default pins RS 8 E 9 D4 4 D5 5 D6 6 D7 7",
            "DISPLAYLCD_PRINT_AT": "LCD write %1 at column %2 row %3"
        }
    );

    Object.assign(Blockly.ScratchMsgs.locales["pt-br"],
        {
            "DISPLAYLCD_CATEGORY": "LCD 16x2",
            "DISPLAYLCD_CLEAR": "limpar LCD",
            "DISPLAYLCD_INIT": "iniciar LCD 16x2 RS %1 E %2 D4 %3 D5 %4 D6 %5 D7 %6",
            "DISPLAYLCD_INIT_DEFAULT": "iniciar LCD 16x2 pinos padrao RS 8 E 9 D4 4 D5 5 D6 6 D7 7",
            "DISPLAYLCD_PRINT_AT": "LCD escrever %1 na coluna %2 linha %3"
        }
    );

    return Blockly;
}

if (typeof module !== 'undefined') {
    module.exports = {getInterfaceTranslations};
}
exports = registerScratchExtensionTranslations;
exports = registerBlocksMessages;
