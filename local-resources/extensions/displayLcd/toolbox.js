/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerToolboxs () {
    return `
<category name="%{BKY_DISPLAYLCD_CATEGORY}" id="DISPLAYLCD_CATEGORY" colour="#0F8B8D" secondaryColour="#0B6B6D">
    <block type="displayLcd_initDefault" id="displayLcd_initDefault"></block>
    <block type="displayLcd_init" id="displayLcd_init">
        <field name="RS">8</field>
        <field name="E">9</field>
        <field name="D4">4</field>
        <field name="D5">5</field>
        <field name="D6">6</field>
        <field name="D7">7</field>
    </block>
    <block type="displayLcd_printAt" id="displayLcd_printAt">
        <value name="TEXT">
            <shadow type="text">
                <field name="TEXT">Ola Dogoblock</field>
            </shadow>
        </value>
        <value name="COL">
            <shadow type="math_whole_number">
                <field name="NUM">0</field>
            </shadow>
        </value>
        <value name="ROW">
            <shadow type="math_whole_number">
                <field name="NUM">0</field>
            </shadow>
        </value>
    </block>
    <block type="displayLcd_clear" id="displayLcd_clear"></block>
</category>`;
}

exports = registerToolboxs;
