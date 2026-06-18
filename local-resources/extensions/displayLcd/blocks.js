/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerBlocks (Blockly) {
    const colour = '#0F8B8D';
    const secondaryColour = '#0B6B6D';

    const digitalPins = Blockly.Device.getPinOptions('arduino_pin_setDigitalOutput');

    Blockly.Blocks.displayLcd_initDefault = {
        init: function () {
            this.jsonInit({
                message0: Blockly.Msg.DISPLAYLCD_INIT_DEFAULT,
                colour,
                secondaryColour,
                extensions: ['shape_statement']
            });
        }
    };

    Blockly.Blocks.displayLcd_init = {
        init: function () {
            this.jsonInit({
                message0: Blockly.Msg.DISPLAYLCD_INIT,
                args0: [
                    {
                        type: 'field_dropdown',
                        name: 'RS',
                        options: digitalPins
                    },
                    {
                        type: 'field_dropdown',
                        name: 'E',
                        options: digitalPins
                    },
                    {
                        type: 'field_dropdown',
                        name: 'D4',
                        options: digitalPins
                    },
                    {
                        type: 'field_dropdown',
                        name: 'D5',
                        options: digitalPins
                    },
                    {
                        type: 'field_dropdown',
                        name: 'D6',
                        options: digitalPins
                    },
                    {
                        type: 'field_dropdown',
                        name: 'D7',
                        options: digitalPins
                    }
                ],
                colour,
                secondaryColour,
                extensions: ['shape_statement']
            });
        }
    };

    Blockly.Blocks.displayLcd_clear = {
        init: function () {
            this.jsonInit({
                message0: Blockly.Msg.DISPLAYLCD_CLEAR,
                colour,
                secondaryColour,
                extensions: ['shape_statement']
            });
        }
    };

    Blockly.Blocks.displayLcd_printAt = {
        init: function () {
            this.jsonInit({
                message0: Blockly.Msg.DISPLAYLCD_PRINT_AT,
                args0: [
                    {
                        type: 'input_value',
                        name: 'TEXT'
                    },
                    {
                        type: 'input_value',
                        name: 'COL'
                    },
                    {
                        type: 'input_value',
                        name: 'ROW'
                    }
                ],
                colour,
                secondaryColour,
                extensions: ['shape_statement']
            });
        }
    };

    return Blockly;
}

exports = registerBlocks;
