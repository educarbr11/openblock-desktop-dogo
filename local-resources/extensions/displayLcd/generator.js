/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerGenerators (Blockly) {
    const setupLcd = (rs, e, d4, d5, d6, d7) => {
        Blockly.Arduino.includes_.displayLcd = `#include <LiquidCrystal.h>`;
        Blockly.Arduino.definitions_.displayLcd = `LiquidCrystal dogoblockLcd(${rs}, ${e}, ${d4}, ${d5}, ${d6}, ${d7});`;
        Blockly.Arduino.setups_.displayLcd = `dogoblockLcd.begin(16, 2);`;
        return '';
    };

    const ensureLcdReady = () => {
        if (!Blockly.Arduino.definitions_.displayLcd) {
            setupLcd('8', '9', '4', '5', '6', '7');
        }
    };

    Blockly.Arduino.displayLcd_initDefault = function () {
        return setupLcd('8', '9', '4', '5', '6', '7');
    };

    Blockly.Arduino.displayLcd_init = function (block) {
        return setupLcd(
            block.getFieldValue('RS'),
            block.getFieldValue('E'),
            block.getFieldValue('D4'),
            block.getFieldValue('D5'),
            block.getFieldValue('D6'),
            block.getFieldValue('D7')
        );
    };

    Blockly.Arduino.displayLcd_clear = function () {
        ensureLcdReady();
        return `dogoblockLcd.clear();\n`;
    };

    Blockly.Arduino.displayLcd_printAt = function (block) {
        const text = Blockly.Arduino.valueToCode(block, 'TEXT', Blockly.Arduino.ORDER_ATOMIC) || '""';
        const col = Blockly.Arduino.valueToCode(block, 'COL', Blockly.Arduino.ORDER_ATOMIC) || '0';
        const row = Blockly.Arduino.valueToCode(block, 'ROW', Blockly.Arduino.ORDER_ATOMIC) || '0';
        ensureLcdReady();
        return `dogoblockLcd.setCursor(${col}, ${row});\ndogoblockLcd.print(${text});\n`;
    };

    return Blockly;
}

exports = registerGenerators;
