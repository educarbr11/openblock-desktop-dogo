/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerToolboxs () {
    return `
<category name="%{BKY_LEDMATRIX_CATEGORY}" id="LEDMATRIX_CATEGORY" colour="#0F8B8D" secondaryColour="#0B6B6D">
    <block type="ledMatrix_matrixInit" id="ledMatrix_matrixInit">
        <field name="TYPE">8</field>
        <field name="DIN">11</field>
        <field name="CS">10</field>
        <field name="CLK">13</field>
    </block>
    <block type="ledMatrix_matrixSetPixel" id="ledMatrix_matrixSetPixel">
        <value name="X">
            <shadow type="math_whole_number">
                <field name="NUM">0</field>
            </shadow>
        </value>
        <value name="Y">
            <shadow type="math_whole_number">
                <field name="NUM">0</field>
            </shadow>
        </value>
    </block>
    <block type="ledMatrix_matrixShowPattern" id="ledMatrix_matrixShowPattern">
        <value name="MATRIX">
            <shadow type="matrix">
                <field name="MATRIX">1010111011101011000110001</field>
            </shadow>
        </value>
    </block>
    <block type="ledMatrix_matrixShowPattern8x8" id="ledMatrix_matrixShowPattern8x8">
        <field name="MATRIX">0000000001000010001001000001100000011000001001000100001000000000</field>
    </block>
    <block type="ledMatrix_matrixShowText" id="ledMatrix_matrixShowText">
        <value name="TEXT">
            <shadow type="text">
                <field name="TEXT">A</field>
            </shadow>
        </value>
    </block>
    <block type="ledMatrix_matrixBrightness" id="ledMatrix_matrixBrightness">
        <value name="BRT">
            <shadow type="ledMatrix_brightnessNumber">
                <field name="NUM">8</field>
            </shadow>
        </value>
    </block>
    <block type="ledMatrix_matrixClear" id="ledMatrix_matrixClear"></block>
</category>`;
}

exports = registerToolboxs;
