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
            "ledMatrix.name": "LED Matrix",
            "ledMatrix.description": "Control 8x8 and 5x5 MAX7219 LED matrices."
        },
        "pt-br": {
            "ledMatrix.name": "Matriz LED",
            "ledMatrix.description": "Controle matrizes de LED 8x8 e 5x5 MAX7219."
        }
    };
}

function registerScratchExtensionTranslations () {
    return {};
}

function registerBlocksMessages (Blockly) {
    Object.assign(Blockly.ScratchMsgs.locales["en"],
        {
            "LEDMATRIX_BRIGHTNESS": "set LED matrix brightness %1",
            "LEDMATRIX_CATEGORY": "LED Matrix",
            "LEDMATRIX_CLEAR": "clear LED matrix",
            "LEDMATRIX_INIT": "init LED matrix type %1 DIN %2 CS %3 CLK %4",
            "LEDMATRIX_SET_PIXEL": "set LED matrix pixel x %1 y %2 %3",
            "LEDMATRIX_SHOW_PATTERN_5X5": "show 5x5 matrix drawing %1",
            "LEDMATRIX_SHOW_PATTERN_8X8": "show 8x8 matrix drawing %1",
            "LEDMATRIX_SHOW_TEXT": "show LED matrix character %1",
            "LEDMATRIX_STATE_OFF": "off",
            "LEDMATRIX_STATE_ON": "on",
            "LEDMATRIX_TYPE_5X5": "5x5",
            "LEDMATRIX_TYPE_8X8": "8x8"
        }
    );

    Object.assign(Blockly.ScratchMsgs.locales["pt-br"],
        {
            "LEDMATRIX_BRIGHTNESS": "definir brilho da matriz LED %1",
            "LEDMATRIX_CATEGORY": "Matriz LED",
            "LEDMATRIX_CLEAR": "limpar matriz LED",
            "LEDMATRIX_INIT": "iniciar matriz LED tipo %1 DIN %2 CS %3 CLK %4",
            "LEDMATRIX_SET_PIXEL": "definir pixel da matriz LED x %1 y %2 %3",
            "LEDMATRIX_SHOW_PATTERN_5X5": "mostrar desenho 5x5 na matriz %1",
            "LEDMATRIX_SHOW_PATTERN_8X8": "mostrar desenho 8x8 na matriz %1",
            "LEDMATRIX_SHOW_TEXT": "mostrar caractere na matriz LED %1",
            "LEDMATRIX_STATE_OFF": "desligado",
            "LEDMATRIX_STATE_ON": "ligado",
            "LEDMATRIX_TYPE_5X5": "5x5",
            "LEDMATRIX_TYPE_8X8": "8x8"
        }
    );

    return Blockly;
}

if (typeof module !== 'undefined') {
    module.exports = {getInterfaceTranslations};
}
exports = registerScratchExtensionTranslations;
exports = registerBlocksMessages;
