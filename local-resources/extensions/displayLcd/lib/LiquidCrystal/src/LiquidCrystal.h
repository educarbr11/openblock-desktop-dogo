#ifndef DOGOBLOCK_LIQUID_CRYSTAL_H
#define DOGOBLOCK_LIQUID_CRYSTAL_H

#include <Arduino.h>
#include <Print.h>

class LiquidCrystal : public Print {
public:
    LiquidCrystal(uint8_t rs, uint8_t enable, uint8_t d4, uint8_t d5, uint8_t d6, uint8_t d7);

    void begin(uint8_t cols, uint8_t rows);
    void clear();
    void home();
    void setCursor(uint8_t col, uint8_t row);
    void noDisplay();
    void display();
    void noCursor();
    void cursor();
    void noBlink();
    void blink();
    void scrollDisplayLeft();
    void scrollDisplayRight();
    void leftToRight();
    void rightToLeft();
    void autoscroll();
    void noAutoscroll();
    void command(uint8_t value);
    virtual size_t write(uint8_t value);
    using Print::write;

private:
    void send(uint8_t value, uint8_t mode);
    void write4bits(uint8_t value);
    void pulseEnable();

    uint8_t _rsPin;
    uint8_t _enablePin;
    uint8_t _dataPins[4];
    uint8_t _displayFunction;
    uint8_t _displayControl;
    uint8_t _displayMode;
    uint8_t _initialized;
    uint8_t _numLines;
    uint8_t _rowOffsets[4];
};

#endif
