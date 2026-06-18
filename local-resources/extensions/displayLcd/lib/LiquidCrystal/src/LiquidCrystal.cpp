#include "LiquidCrystal.h"

#define LCD_CLEARDISPLAY 0x01
#define LCD_RETURNHOME 0x02
#define LCD_ENTRYMODESET 0x04
#define LCD_DISPLAYCONTROL 0x08
#define LCD_CURSORSHIFT 0x10
#define LCD_FUNCTIONSET 0x20
#define LCD_SETDDRAMADDR 0x80

#define LCD_ENTRYRIGHT 0x00
#define LCD_ENTRYLEFT 0x02
#define LCD_ENTRYSHIFTINCREMENT 0x01
#define LCD_ENTRYSHIFTDECREMENT 0x00

#define LCD_DISPLAYON 0x04
#define LCD_DISPLAYOFF 0x00
#define LCD_CURSORON 0x02
#define LCD_CURSOROFF 0x00
#define LCD_BLINKON 0x01
#define LCD_BLINKOFF 0x00

#define LCD_DISPLAYMOVE 0x08
#define LCD_CURSORMOVE 0x00
#define LCD_MOVERIGHT 0x04
#define LCD_MOVELEFT 0x00

#define LCD_4BITMODE 0x00
#define LCD_2LINE 0x08
#define LCD_1LINE 0x00
#define LCD_5x8DOTS 0x00

LiquidCrystal::LiquidCrystal(uint8_t rs, uint8_t enable, uint8_t d4, uint8_t d5, uint8_t d6, uint8_t d7) {
    _rsPin = rs;
    _enablePin = enable;
    _dataPins[0] = d4;
    _dataPins[1] = d5;
    _dataPins[2] = d6;
    _dataPins[3] = d7;
    _displayFunction = LCD_4BITMODE | LCD_1LINE | LCD_5x8DOTS;
    _initialized = 0;
}

void LiquidCrystal::begin(uint8_t cols, uint8_t rows) {
    if (rows > 1) {
        _displayFunction |= LCD_2LINE;
    }
    _numLines = rows;
    _rowOffsets[0] = 0x00;
    _rowOffsets[1] = 0x40;
    _rowOffsets[2] = cols;
    _rowOffsets[3] = 0x40 + cols;

    pinMode(_rsPin, OUTPUT);
    pinMode(_enablePin, OUTPUT);
    for (uint8_t i = 0; i < 4; i++) {
        pinMode(_dataPins[i], OUTPUT);
    }

    delayMicroseconds(50000);
    digitalWrite(_rsPin, LOW);
    digitalWrite(_enablePin, LOW);

    write4bits(0x03);
    delayMicroseconds(4500);
    write4bits(0x03);
    delayMicroseconds(4500);
    write4bits(0x03);
    delayMicroseconds(150);
    write4bits(0x02);

    command(LCD_FUNCTIONSET | _displayFunction);
    _displayControl = LCD_DISPLAYON | LCD_CURSOROFF | LCD_BLINKOFF;
    display();
    clear();
    _displayMode = LCD_ENTRYLEFT | LCD_ENTRYSHIFTDECREMENT;
    command(LCD_ENTRYMODESET | _displayMode);
    _initialized = 1;
}

void LiquidCrystal::clear() {
    command(LCD_CLEARDISPLAY);
    delayMicroseconds(2000);
}

void LiquidCrystal::home() {
    command(LCD_RETURNHOME);
    delayMicroseconds(2000);
}

void LiquidCrystal::setCursor(uint8_t col, uint8_t row) {
    if (row >= _numLines) {
        row = _numLines - 1;
    }
    command(LCD_SETDDRAMADDR | (col + _rowOffsets[row]));
}

void LiquidCrystal::noDisplay() {
    _displayControl &= ~LCD_DISPLAYON;
    command(LCD_DISPLAYCONTROL | _displayControl);
}

void LiquidCrystal::display() {
    _displayControl |= LCD_DISPLAYON;
    command(LCD_DISPLAYCONTROL | _displayControl);
}

void LiquidCrystal::noCursor() {
    _displayControl &= ~LCD_CURSORON;
    command(LCD_DISPLAYCONTROL | _displayControl);
}

void LiquidCrystal::cursor() {
    _displayControl |= LCD_CURSORON;
    command(LCD_DISPLAYCONTROL | _displayControl);
}

void LiquidCrystal::noBlink() {
    _displayControl &= ~LCD_BLINKON;
    command(LCD_DISPLAYCONTROL | _displayControl);
}

void LiquidCrystal::blink() {
    _displayControl |= LCD_BLINKON;
    command(LCD_DISPLAYCONTROL | _displayControl);
}

void LiquidCrystal::scrollDisplayLeft() {
    command(LCD_CURSORSHIFT | LCD_DISPLAYMOVE | LCD_MOVELEFT);
}

void LiquidCrystal::scrollDisplayRight() {
    command(LCD_CURSORSHIFT | LCD_DISPLAYMOVE | LCD_MOVERIGHT);
}

void LiquidCrystal::leftToRight() {
    _displayMode |= LCD_ENTRYLEFT;
    command(LCD_ENTRYMODESET | _displayMode);
}

void LiquidCrystal::rightToLeft() {
    _displayMode &= ~LCD_ENTRYLEFT;
    command(LCD_ENTRYMODESET | _displayMode);
}

void LiquidCrystal::autoscroll() {
    _displayMode |= LCD_ENTRYSHIFTINCREMENT;
    command(LCD_ENTRYMODESET | _displayMode);
}

void LiquidCrystal::noAutoscroll() {
    _displayMode &= ~LCD_ENTRYSHIFTINCREMENT;
    command(LCD_ENTRYMODESET | _displayMode);
}

void LiquidCrystal::command(uint8_t value) {
    send(value, LOW);
}

size_t LiquidCrystal::write(uint8_t value) {
    send(value, HIGH);
    return 1;
}

void LiquidCrystal::send(uint8_t value, uint8_t mode) {
    digitalWrite(_rsPin, mode);
    write4bits(value >> 4);
    write4bits(value);
}

void LiquidCrystal::write4bits(uint8_t value) {
    for (uint8_t i = 0; i < 4; i++) {
        digitalWrite(_dataPins[i], (value >> i) & 0x01);
    }
    pulseEnable();
}

void LiquidCrystal::pulseEnable() {
    digitalWrite(_enablePin, LOW);
    delayMicroseconds(1);
    digitalWrite(_enablePin, HIGH);
    delayMicroseconds(1);
    digitalWrite(_enablePin, LOW);
    delayMicroseconds(100);
}
