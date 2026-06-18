/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerGenerators (Blockly) {
    const matrix5x5ToRows = matrixValue => {
        const matrixString = String(matrixValue || '')
            .replace(/[^01]/g, '')
            .padEnd(25, '0')
            .substr(0, 25);
        const rows = [0, 0, 0, 0, 0, 0, 0, 0];

        for (let index = 0; index < 25; index++) {
            if (matrixString[index] !== '1') continue;
            const x5 = index % 5;
            const y5 = Math.floor(index / 5);
            rows[y5] |= (1 << (7 - x5));
        }

        return rows;
    };

    const matrix8x8ToRows = matrixValue => {
        const matrixString = String(matrixValue || '')
            .replace(/[^01]/g, '')
            .padEnd(64, '0')
            .substr(0, 64);
        const rows = [];
        for (let row = 0; row < 8; row++) {
            let rowValue = 0;
            for (let col = 0; col < 8; col++) {
                if (matrixString[(row * 8) + col] === '1') {
                    rowValue |= (1 << (7 - col));
                }
            }
            rows.push(rowValue);
        }
        return rows;
    };

    const ensureMatrixHelpers = () => {
        if (!Blockly.Arduino.definitions_.ledMatrix_matrixPins) {
            Blockly.Arduino.definitions_.ledMatrix_matrixPins =
                `#define DOGOBLOCK_MATRIX_DIN 11\n#define DOGOBLOCK_MATRIX_CS 10\n#define DOGOBLOCK_MATRIX_CLK 13`;
        }
        if (!Blockly.Arduino.definitions_.ledMatrix_matrixSize) {
            Blockly.Arduino.definitions_.ledMatrix_matrixSize = `#define DOGOBLOCK_MATRIX_SIZE 8`;
        }
        Blockly.Arduino.definitions_.ledMatrix_matrixBuffer = `byte dogoblockMatrixRows[8] = {0, 0, 0, 0, 0, 0, 0, 0};`;
        Blockly.Arduino.definitions_.ledMatrix_matrixHelpers = `
void dogoblockMatrixSend(byte address, byte data) {
  digitalWrite(DOGOBLOCK_MATRIX_CS, LOW);
  shiftOut(DOGOBLOCK_MATRIX_DIN, DOGOBLOCK_MATRIX_CLK, MSBFIRST, address);
  shiftOut(DOGOBLOCK_MATRIX_DIN, DOGOBLOCK_MATRIX_CLK, MSBFIRST, data);
  digitalWrite(DOGOBLOCK_MATRIX_CS, HIGH);
}

void dogoblockMatrixRefresh() {
  for (byte row = 0; row < 8; row++) {
    dogoblockMatrixSend(row + 1, dogoblockMatrixRows[row]);
  }
}

void dogoblockMatrixClear() {
  for (byte row = 0; row < 8; row++) {
    dogoblockMatrixRows[row] = 0;
  }
  dogoblockMatrixRefresh();
}

void dogoblockMatrixSetPixel(byte x, byte y, bool state) {
  if (x >= DOGOBLOCK_MATRIX_SIZE || y >= DOGOBLOCK_MATRIX_SIZE) return;
  byte mask = 1 << (7 - x);
  if (state) {
    dogoblockMatrixRows[y] |= mask;
  } else {
    dogoblockMatrixRows[y] &= ~mask;
  }
  dogoblockMatrixSend(y + 1, dogoblockMatrixRows[y]);
}

void dogoblockMatrixShowPattern(const byte rows[8]) {
  for (byte row = 0; row < 8; row++) {
    dogoblockMatrixRows[row] = row < DOGOBLOCK_MATRIX_SIZE ? rows[row] : 0;
    if (DOGOBLOCK_MATRIX_SIZE == 5 && row < DOGOBLOCK_MATRIX_SIZE) {
      dogoblockMatrixRows[row] &= 0xF8;
    }
  }
  dogoblockMatrixRefresh();
}

void dogoblockMatrixDrawColumns(byte c0, byte c1, byte c2, byte c3, byte c4) {
  dogoblockMatrixClear();
  byte cols[5] = {c0, c1, c2, c3, c4};
  for (byte x = 0; x < 5; x++) {
    for (byte y = 0; y < 7; y++) {
      byte targetX = DOGOBLOCK_MATRIX_SIZE == 5 ? x : x + 1;
      if (cols[x] & (1 << y)) dogoblockMatrixSetPixel(targetX, y, true);
    }
  }
}

void dogoblockMatrixShowChar(char c) {
  if (c >= 'a' && c <= 'z') c -= 32;
  switch (c) {
    case '0': dogoblockMatrixDrawColumns(0x3E, 0x51, 0x49, 0x45, 0x3E); break;
    case '1': dogoblockMatrixDrawColumns(0x00, 0x42, 0x7F, 0x40, 0x00); break;
    case '2': dogoblockMatrixDrawColumns(0x42, 0x61, 0x51, 0x49, 0x46); break;
    case '3': dogoblockMatrixDrawColumns(0x21, 0x41, 0x45, 0x4B, 0x31); break;
    case '4': dogoblockMatrixDrawColumns(0x18, 0x14, 0x12, 0x7F, 0x10); break;
    case '5': dogoblockMatrixDrawColumns(0x27, 0x45, 0x45, 0x45, 0x39); break;
    case '6': dogoblockMatrixDrawColumns(0x3C, 0x4A, 0x49, 0x49, 0x30); break;
    case '7': dogoblockMatrixDrawColumns(0x01, 0x71, 0x09, 0x05, 0x03); break;
    case '8': dogoblockMatrixDrawColumns(0x36, 0x49, 0x49, 0x49, 0x36); break;
    case '9': dogoblockMatrixDrawColumns(0x06, 0x49, 0x49, 0x29, 0x1E); break;
    case 'A': dogoblockMatrixDrawColumns(0x7E, 0x11, 0x11, 0x11, 0x7E); break;
    case 'B': dogoblockMatrixDrawColumns(0x7F, 0x49, 0x49, 0x49, 0x36); break;
    case 'C': dogoblockMatrixDrawColumns(0x3E, 0x41, 0x41, 0x41, 0x22); break;
    case 'D': dogoblockMatrixDrawColumns(0x7F, 0x41, 0x41, 0x22, 0x1C); break;
    case 'E': dogoblockMatrixDrawColumns(0x7F, 0x49, 0x49, 0x49, 0x41); break;
    case 'F': dogoblockMatrixDrawColumns(0x7F, 0x09, 0x09, 0x09, 0x01); break;
    case 'G': dogoblockMatrixDrawColumns(0x3E, 0x41, 0x49, 0x49, 0x7A); break;
    case 'H': dogoblockMatrixDrawColumns(0x7F, 0x08, 0x08, 0x08, 0x7F); break;
    case 'I': dogoblockMatrixDrawColumns(0x00, 0x41, 0x7F, 0x41, 0x00); break;
    case 'J': dogoblockMatrixDrawColumns(0x20, 0x40, 0x41, 0x3F, 0x01); break;
    case 'K': dogoblockMatrixDrawColumns(0x7F, 0x08, 0x14, 0x22, 0x41); break;
    case 'L': dogoblockMatrixDrawColumns(0x7F, 0x40, 0x40, 0x40, 0x40); break;
    case 'M': dogoblockMatrixDrawColumns(0x7F, 0x02, 0x0C, 0x02, 0x7F); break;
    case 'N': dogoblockMatrixDrawColumns(0x7F, 0x04, 0x08, 0x10, 0x7F); break;
    case 'O': dogoblockMatrixDrawColumns(0x3E, 0x41, 0x41, 0x41, 0x3E); break;
    case 'P': dogoblockMatrixDrawColumns(0x7F, 0x09, 0x09, 0x09, 0x06); break;
    case 'Q': dogoblockMatrixDrawColumns(0x3E, 0x41, 0x51, 0x21, 0x5E); break;
    case 'R': dogoblockMatrixDrawColumns(0x7F, 0x09, 0x19, 0x29, 0x46); break;
    case 'S': dogoblockMatrixDrawColumns(0x46, 0x49, 0x49, 0x49, 0x31); break;
    case 'T': dogoblockMatrixDrawColumns(0x01, 0x01, 0x7F, 0x01, 0x01); break;
    case 'U': dogoblockMatrixDrawColumns(0x3F, 0x40, 0x40, 0x40, 0x3F); break;
    case 'V': dogoblockMatrixDrawColumns(0x1F, 0x20, 0x40, 0x20, 0x1F); break;
    case 'W': dogoblockMatrixDrawColumns(0x3F, 0x40, 0x38, 0x40, 0x3F); break;
    case 'X': dogoblockMatrixDrawColumns(0x63, 0x14, 0x08, 0x14, 0x63); break;
    case 'Y': dogoblockMatrixDrawColumns(0x07, 0x08, 0x70, 0x08, 0x07); break;
    case 'Z': dogoblockMatrixDrawColumns(0x61, 0x51, 0x49, 0x45, 0x43); break;
    default: dogoblockMatrixClear(); break;
  }
}
`;
    };

    const matrixSetupCode = () =>
        `pinMode(DOGOBLOCK_MATRIX_DIN, OUTPUT);\npinMode(DOGOBLOCK_MATRIX_CS, OUTPUT);\npinMode(DOGOBLOCK_MATRIX_CLK, OUTPUT);\ndigitalWrite(DOGOBLOCK_MATRIX_CS, HIGH);\ndogoblockMatrixSend(0x09, 0x00);\ndogoblockMatrixSend(0x0A, 0x08);\ndogoblockMatrixSend(0x0B, 0x07);\ndogoblockMatrixSend(0x0C, 0x01);\ndogoblockMatrixSend(0x0F, 0x00);\ndogoblockMatrixClear();`;

    const ensureMatrixReady = () => {
        ensureMatrixHelpers();
        if (!Blockly.Arduino.setups_.ledMatrix_matrixInit) {
            Blockly.Arduino.setups_.ledMatrix_matrixInit = matrixSetupCode();
        }
    };

    const setupMatrix = (din, cs, clk, size = '8') => {
        Blockly.Arduino.definitions_.ledMatrix_matrixPins =
            `#define DOGOBLOCK_MATRIX_DIN ${din}\n#define DOGOBLOCK_MATRIX_CS ${cs}\n#define DOGOBLOCK_MATRIX_CLK ${clk}`;
        Blockly.Arduino.definitions_.ledMatrix_matrixSize = `#define DOGOBLOCK_MATRIX_SIZE ${size}`;
        ensureMatrixHelpers();
        Blockly.Arduino.setups_.ledMatrix_matrixInit = matrixSetupCode();
        return '';
    };

    Blockly.Arduino.ledMatrix_matrixInit = function (block) {
        return setupMatrix(
            block.getFieldValue('DIN'),
            block.getFieldValue('CS'),
            block.getFieldValue('CLK'),
            block.getFieldValue('TYPE') || '8'
        );
    };

    Blockly.Arduino.ledMatrix_matrixClear = function () {
        ensureMatrixReady();
        return `dogoblockMatrixClear();\n`;
    };

    Blockly.Arduino.ledMatrix_matrixBrightness = function (block) {
        const brt = Blockly.Arduino.valueToCode(block, 'BRT', Blockly.Arduino.ORDER_ATOMIC) || '8';
        ensureMatrixReady();
        return `dogoblockMatrixSend(0x0A, constrain(${brt}, 0, 15));\n`;
    };

    Blockly.Arduino.ledMatrix_matrixSetPixel = function (block) {
        const x = Blockly.Arduino.valueToCode(block, 'X', Blockly.Arduino.ORDER_ATOMIC) || '0';
        const y = Blockly.Arduino.valueToCode(block, 'Y', Blockly.Arduino.ORDER_ATOMIC) || '0';
        const state = block.getFieldValue('STATE') === 'on' ? 'true' : 'false';
        ensureMatrixReady();
        return `dogoblockMatrixSetPixel(${x}, ${y}, ${state});\n`;
    };

    Blockly.Arduino.ledMatrix_matrixShowPattern = function (block) {
        const matrix = Blockly.Arduino.valueToCode(block, 'MATRIX', Blockly.Arduino.ORDER_ATOMIC) || '0';
        const rows = matrix5x5ToRows(matrix)
            .map(rowValue => `0x${rowValue.toString(16).padStart(2, '0')}`);
        const varName = `dogoblockMatrixPattern_${block.id.replace(/\W/g, '_')}`;
        Blockly.Arduino.definitions_[varName] = `const byte ${varName}[8] = {${rows.join(', ')}};`;
        ensureMatrixReady();
        return `dogoblockMatrixShowPattern(${varName});\n`;
    };

    Blockly.Arduino.ledMatrix_matrixShowPattern8x8 = function (block) {
        const matrix = block.getFieldValue('MATRIX');
        const rows = matrix8x8ToRows(matrix)
            .map(rowValue => `0x${rowValue.toString(16).padStart(2, '0')}`);

        const varName = `dogoblockMatrixPattern8x8_${block.id.replace(/\W/g, '_')}`;
        Blockly.Arduino.definitions_[varName] = `const byte ${varName}[8] = {${rows.join(', ')}};`;
        ensureMatrixReady();
        return `dogoblockMatrixShowPattern(${varName});\n`;
    };

    Blockly.Arduino.ledMatrix_matrixShowText = function (block) {
        const text = Blockly.Arduino.valueToCode(block, 'TEXT', Blockly.Arduino.ORDER_ATOMIC) || '""';
        ensureMatrixReady();
        return `dogoblockMatrixShowChar(String(${text}).charAt(0));\n`;
    };

    Blockly.Arduino.ledMatrix_brightnessNumber = function (block) {
        return [`${block.getFieldValue('NUM')}`, Blockly.Arduino.ORDER_ATOMIC];
    };

    return Blockly;
}

exports = registerGenerators;
