/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerBlocks (Blockly) {
    const colour = '#0F8B8D';
    const secondaryColour = '#0B6B6D';

    const digitalPins = Blockly.Device.getPinOptions('arduino_pin_setDigitalOutput');

    const registerMatrix8x8Field = () => {
        if (Blockly.FieldMatrix8x8) return;

        const zeros = '0000000000000000000000000000000000000000000000000000000000000000';
        const ones = '1111111111111111111111111111111111111111111111111111111111111111';

        Blockly.FieldMatrix8x8 = function (matrix) {
            Blockly.FieldMatrix8x8.superClass_.constructor.call(this, matrix || zeros);
            this.addArgType('matrix8x8');
            this.ledThumbNodes_ = [];
            this.ledButtons_ = [];
            this.matrix_ = zeros;
            this.matrixStage_ = null;
            this.arrow_ = null;
            this.paintStyle_ = null;
            this.mouseDownWrapper_ = null;
            this.clearButtonWrapper_ = null;
            this.fillButtonWrapper_ = null;
            this.matrixTouchWrapper_ = null;
            this.matrixMoveWrapper_ = null;
            this.matrixReleaseWrapper_ = null;
            this.setValue(matrix || zeros);
        };

        Blockly.FieldMatrix8x8.superClass_ = Blockly.Field.prototype;
        Blockly.FieldMatrix8x8.prototype = Object.create(Blockly.Field.prototype);
        Blockly.FieldMatrix8x8.prototype.constructor = Blockly.FieldMatrix8x8;

        Blockly.FieldMatrix8x8.fromJson = function (options) {
            return new Blockly.FieldMatrix8x8(options.matrix || zeros);
        };

        Blockly.FieldMatrix8x8.THUMBNAIL_SIZE = 34;
        Blockly.FieldMatrix8x8.THUMBNAIL_NODE_SIZE = 3;
        Blockly.FieldMatrix8x8.THUMBNAIL_NODE_PAD = 1;
        Blockly.FieldMatrix8x8.ARROW_SIZE = 12;
        Blockly.FieldMatrix8x8.MATRIX_NODE_SIZE = 16;
        Blockly.FieldMatrix8x8.MATRIX_NODE_RADIUS = 4;
        Blockly.FieldMatrix8x8.MATRIX_NODE_PAD = 4;
        Blockly.FieldMatrix8x8.ZEROS = zeros;
        Blockly.FieldMatrix8x8.ONES = ones;

        Blockly.FieldMatrix8x8.prototype.init = function () {
            if (this.fieldGroup_) return;

            if (this.sourceBlock_.getParent()) {
                const parentBlock = this.sourceBlock_.getParent();
                this.sourceBlock_.setColour(parentBlock.getColour(), parentBlock.getColourSecondary(),
                    parentBlock.getColourTertiary());
            }

            this.fieldGroup_ = Blockly.utils.createSvgElement('g', {}, null);
            this.size_.width = Blockly.FieldMatrix8x8.THUMBNAIL_SIZE +
                Blockly.FieldMatrix8x8.ARROW_SIZE + (Blockly.BlockSvg.DROPDOWN_ARROW_PADDING * 1.5);
            this.sourceBlock_.getSvgRoot().appendChild(this.fieldGroup_);

            const thumbX = Blockly.BlockSvg.DROPDOWN_ARROW_PADDING / 2;
            const thumbY = (this.size_.height - Blockly.FieldMatrix8x8.THUMBNAIL_SIZE) / 2;
            const thumbnail = Blockly.utils.createSvgElement('g', {
                transform: `translate(${thumbX}, ${thumbY})`,
                'pointer-events': 'bounding-box',
                cursor: 'pointer'
            }, this.fieldGroup_);

            this.ledThumbNodes_ = [];
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    this.ledThumbNodes_.push(Blockly.utils.createSvgElement('rect', {
                        x: ((Blockly.FieldMatrix8x8.THUMBNAIL_NODE_SIZE + Blockly.FieldMatrix8x8.THUMBNAIL_NODE_PAD) * col) + Blockly.FieldMatrix8x8.THUMBNAIL_NODE_PAD,
                        y: ((Blockly.FieldMatrix8x8.THUMBNAIL_NODE_SIZE + Blockly.FieldMatrix8x8.THUMBNAIL_NODE_PAD) * row) + Blockly.FieldMatrix8x8.THUMBNAIL_NODE_PAD,
                        width: Blockly.FieldMatrix8x8.THUMBNAIL_NODE_SIZE,
                        height: Blockly.FieldMatrix8x8.THUMBNAIL_NODE_SIZE,
                        rx: Blockly.FieldMatrix8x8.THUMBNAIL_NODE_PAD,
                        ry: Blockly.FieldMatrix8x8.THUMBNAIL_NODE_PAD
                    }, thumbnail));
                }
            }

            if (!this.arrow_) {
                const arrowX = Blockly.FieldMatrix8x8.THUMBNAIL_SIZE +
                    (Blockly.BlockSvg.DROPDOWN_ARROW_PADDING * 1.5);
                const arrowY = (this.size_.height - Blockly.FieldMatrix8x8.ARROW_SIZE) / 2;
                this.arrow_ = Blockly.utils.createSvgElement('image', {
                    height: `${Blockly.FieldMatrix8x8.ARROW_SIZE}px`,
                    width: `${Blockly.FieldMatrix8x8.ARROW_SIZE}px`,
                    transform: `translate(${arrowX}, ${arrowY})`
                }, this.fieldGroup_);
                this.arrow_.setAttributeNS('http://www.w3.org/1999/xlink',
                    'xlink:href', `${Blockly.mainWorkspace.options.pathToMedia}dropdown-arrow.svg`);
            }

            this.updateMatrix_();
            this.mouseDownWrapper_ = Blockly.bindEventWithChecks_(
                this.getClickTarget_(), 'mousedown', this, this.onMouseDown_);
        };

        Blockly.FieldMatrix8x8.prototype.setValue = function (matrix) {
            matrix = String(matrix || zeros).replace(/[^01]/g, '');
            matrix = (matrix + zeros).substr(0, 64);
            if (matrix === this.matrix_) return;
            if (this.sourceBlock_ && Blockly.Events.isEnabled()) {
                Blockly.Events.fire(new Blockly.Events.Change(
                    this.sourceBlock_, 'field', this.name, this.matrix_, matrix));
            }
            this.matrix_ = matrix;
            if (this.sourceBlock_) this.updateMatrix_();
        };

        Blockly.FieldMatrix8x8.prototype.getValue = function () {
            return String(this.matrix_);
        };

        Blockly.FieldMatrix8x8.prototype.showEditor_ = function () {
            Blockly.DropDownDiv.hideWithoutAnimation();
            Blockly.DropDownDiv.clearContent();
            const div = Blockly.DropDownDiv.getContentDiv();
            const matrixSize = (Blockly.FieldMatrix8x8.MATRIX_NODE_SIZE * 8) +
                (Blockly.FieldMatrix8x8.MATRIX_NODE_PAD * 9);

            this.matrixStage_ = Blockly.utils.createSvgElement('svg', {
                xmlns: 'http://www.w3.org/2000/svg',
                'xmlns:html': 'http://www.w3.org/1999/xhtml',
                'xmlns:xlink': 'http://www.w3.org/1999/xlink',
                version: '1.1',
                height: `${matrixSize}px`,
                width: `${matrixSize}px`
            }, div);

            this.ledButtons_ = [];
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    this.ledButtons_.push(Blockly.utils.createSvgElement('rect', {
                        x: `${(Blockly.FieldMatrix8x8.MATRIX_NODE_SIZE * col) + (Blockly.FieldMatrix8x8.MATRIX_NODE_PAD * (col + 1))}px`,
                        y: `${(Blockly.FieldMatrix8x8.MATRIX_NODE_SIZE * row) + (Blockly.FieldMatrix8x8.MATRIX_NODE_PAD * (row + 1))}px`,
                        width: Blockly.FieldMatrix8x8.MATRIX_NODE_SIZE,
                        height: Blockly.FieldMatrix8x8.MATRIX_NODE_SIZE,
                        rx: Blockly.FieldMatrix8x8.MATRIX_NODE_RADIUS,
                        ry: Blockly.FieldMatrix8x8.MATRIX_NODE_RADIUS
                    }, this.matrixStage_));
                }
            }

            const buttonDiv = document.createElement('div');
            const clearButtonDiv = document.createElement('div');
            clearButtonDiv.className = 'scratchMatrixButtonDiv';
            const clearButton = this.createButton_(this.sourceBlock_.colourSecondary_);
            clearButtonDiv.appendChild(clearButton);

            const fillButtonDiv = document.createElement('div');
            fillButtonDiv.className = 'scratchMatrixButtonDiv';
            const fillButton = this.createButton_('#FFFFFF');
            fillButtonDiv.appendChild(fillButton);

            buttonDiv.appendChild(clearButtonDiv);
            buttonDiv.appendChild(fillButtonDiv);
            div.appendChild(buttonDiv);

            Blockly.DropDownDiv.setColour(this.sourceBlock_.getColour(), this.sourceBlock_.getColourTertiary());
            Blockly.DropDownDiv.setCategory(this.sourceBlock_.getCategory());
            Blockly.DropDownDiv.showPositionedByBlock(this, this.sourceBlock_);

            this.matrixTouchWrapper_ = Blockly.bindEvent_(this.matrixStage_, 'mousedown', this, this.onMouseDown);
            this.clearButtonWrapper_ = Blockly.bindEvent_(clearButton, 'click', this, this.clearMatrix_);
            this.fillButtonWrapper_ = Blockly.bindEvent_(fillButton, 'click', this, this.fillMatrix_);
            this.updateMatrix_();
        };

        Blockly.FieldMatrix8x8.prototype.createButton_ = function (fill) {
            const button = Blockly.utils.createSvgElement('svg', {
                xmlns: 'http://www.w3.org/2000/svg',
                'xmlns:html': 'http://www.w3.org/1999/xhtml',
                'xmlns:xlink': 'http://www.w3.org/1999/xlink',
                version: '1.1',
                height: `${Blockly.FieldMatrix8x8.MATRIX_NODE_SIZE}px`,
                width: `${Blockly.FieldMatrix8x8.MATRIX_NODE_SIZE}px`
            });
            const nodeSize = Blockly.FieldMatrix8x8.MATRIX_NODE_SIZE / 4;
            const nodePad = Blockly.FieldMatrix8x8.MATRIX_NODE_SIZE / 16;
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    Blockly.utils.createSvgElement('rect', {
                        x: ((nodeSize + nodePad) * col) + nodePad,
                        y: ((nodeSize + nodePad) * row) + nodePad,
                        width: nodeSize,
                        height: nodeSize,
                        rx: nodePad,
                        ry: nodePad,
                        fill
                    }, button);
                }
            }
            return button;
        };

        Blockly.FieldMatrix8x8.prototype.updateMatrix_ = function () {
            for (let index = 0; index < this.matrix_.length; index++) {
                const fill = this.matrix_[index] === '0' ? this.sourceBlock_.colourSecondary_ : '#FFFFFF';
                const thumbFill = this.matrix_[index] === '0' ? this.sourceBlock_.colour_ : '#FFFFFF';
                this.fillMatrixNode_(this.ledButtons_, index, fill);
                this.fillMatrixNode_(this.ledThumbNodes_, index, thumbFill);
            }
        };

        Blockly.FieldMatrix8x8.prototype.clearMatrix_ = function (e) {
            if (e.button !== 0) return;
            this.setValue(zeros);
        };

        Blockly.FieldMatrix8x8.prototype.fillMatrix_ = function (e) {
            if (e.button !== 0) return;
            this.setValue(ones);
        };

        Blockly.FieldMatrix8x8.prototype.fillMatrixNode_ = function (node, index, fill) {
            if (!node || !node[index] || !fill) return;
            node[index].setAttribute('fill', fill);
        };

        Blockly.FieldMatrix8x8.prototype.setLEDNode_ = function (led, state) {
            if (led < 0 || led > 63) return;
            this.setValue(this.matrix_.substr(0, led) + state + this.matrix_.substr(led + 1));
        };

        Blockly.FieldMatrix8x8.prototype.toggleLEDNode_ = function (led) {
            if (led < 0 || led > 63) return;
            this.setLEDNode_(led, this.matrix_.charAt(led) === '0' ? '1' : '0');
        };

        Blockly.FieldMatrix8x8.prototype.onMouseDown = function (e) {
            this.matrixMoveWrapper_ = Blockly.bindEvent_(document.body, 'mousemove', this, this.onMouseMove);
            this.matrixReleaseWrapper_ = Blockly.bindEvent_(document.body, 'mouseup', this, this.onMouseUp);
            const ledHit = this.checkForLED_(e);
            if (ledHit > -1) {
                this.paintStyle_ = this.matrix_.charAt(ledHit) === '0' ? 'fill' : 'clear';
                this.toggleLEDNode_(ledHit);
                this.updateMatrix_();
            } else {
                this.paintStyle_ = null;
            }
        };

        Blockly.FieldMatrix8x8.prototype.onMouseUp = function () {
            Blockly.unbindEvent_(this.matrixMoveWrapper_);
            Blockly.unbindEvent_(this.matrixReleaseWrapper_);
            this.paintStyle_ = null;
        };

        Blockly.FieldMatrix8x8.prototype.onMouseMove = function (e) {
            e.preventDefault();
            if (!this.paintStyle_) return;
            const led = this.checkForLED_(e);
            if (led < 0) return;
            this.setLEDNode_(led, this.paintStyle_ === 'clear' ? '0' : '1');
        };

        Blockly.FieldMatrix8x8.prototype.checkForLED_ = function (e) {
            const bBox = this.matrixStage_.getBoundingClientRect();
            const nodeSize = Blockly.FieldMatrix8x8.MATRIX_NODE_SIZE;
            const nodePad = Blockly.FieldMatrix8x8.MATRIX_NODE_PAD;
            const dx = e.clientX - bBox.left;
            const dy = e.clientY - bBox.top;
            const min = nodePad / 2;
            const max = bBox.width - (nodePad / 2);
            if (dx < min || dx > max || dy < min || dy > max) return -1;
            const xDiv = Math.trunc((dx - (nodePad / 2)) / (nodeSize + nodePad));
            const yDiv = Math.trunc((dy - (nodePad / 2)) / (nodeSize + nodePad));
            if (xDiv < 0 || xDiv > 7 || yDiv < 0 || yDiv > 7) return -1;
            return xDiv + (yDiv * 8);
        };

        Blockly.FieldMatrix8x8.prototype.dispose_ = function () {
            const thisField = this;
            return function () {
                Blockly.FieldMatrix8x8.superClass_.dispose_.call(thisField)();
                thisField.matrixStage_ = null;
                if (thisField.mouseDownWrapper_) Blockly.unbindEvent_(thisField.mouseDownWrapper_);
                if (thisField.matrixTouchWrapper_) Blockly.unbindEvent_(thisField.matrixTouchWrapper_);
                if (thisField.matrixReleaseWrapper_) Blockly.unbindEvent_(thisField.matrixReleaseWrapper_);
                if (thisField.matrixMoveWrapper_) Blockly.unbindEvent_(thisField.matrixMoveWrapper_);
                if (thisField.clearButtonWrapper_) Blockly.unbindEvent_(thisField.clearButtonWrapper_);
                if (thisField.fillButtonWrapper_) Blockly.unbindEvent_(thisField.fillButtonWrapper_);
            };
        };

        Blockly.Field.register('field_matrix8x8', Blockly.FieldMatrix8x8);
    };

    registerMatrix8x8Field();

    const stateOptions = () => [
        [Blockly.Msg.LEDMATRIX_STATE_ON, 'on'],
        [Blockly.Msg.LEDMATRIX_STATE_OFF, 'off']
    ];

    const matrixTypeOptions = () => [
        [Blockly.Msg.LEDMATRIX_TYPE_8X8, '8'],
        [Blockly.Msg.LEDMATRIX_TYPE_5X5, '5']
    ];

    Blockly.Blocks.ledMatrix_matrixInit = {
        init: function () {
            this.jsonInit({
                message0: Blockly.Msg.LEDMATRIX_INIT,
                args0: [
                    {
                        type: 'field_dropdown',
                        name: 'TYPE',
                        options: matrixTypeOptions()
                    },
                    {
                        type: 'field_dropdown',
                        name: 'DIN',
                        options: digitalPins
                    },
                    {
                        type: 'field_dropdown',
                        name: 'CS',
                        options: digitalPins
                    },
                    {
                        type: 'field_dropdown',
                        name: 'CLK',
                        options: digitalPins
                    }
                ],
                colour,
                secondaryColour,
                extensions: ['shape_statement']
            });
        }
    };

    Blockly.Blocks.ledMatrix_matrixClear = {
        init: function () {
            this.jsonInit({
                message0: Blockly.Msg.LEDMATRIX_CLEAR,
                colour,
                secondaryColour,
                extensions: ['shape_statement']
            });
        }
    };

    Blockly.Blocks.ledMatrix_matrixBrightness = {
        init: function () {
            this.jsonInit({
                message0: Blockly.Msg.LEDMATRIX_BRIGHTNESS,
                args0: [
                    {
                        type: 'input_value',
                        name: 'BRT'
                    }
                ],
                colour,
                secondaryColour,
                extensions: ['shape_statement']
            });
        }
    };

    Blockly.Blocks.ledMatrix_matrixSetPixel = {
        init: function () {
            this.jsonInit({
                message0: Blockly.Msg.LEDMATRIX_SET_PIXEL,
                args0: [
                    {
                        type: 'input_value',
                        name: 'X'
                    },
                    {
                        type: 'input_value',
                        name: 'Y'
                    },
                    {
                        type: 'field_dropdown',
                        name: 'STATE',
                        options: stateOptions()
                    }
                ],
                colour,
                secondaryColour,
                extensions: ['shape_statement']
            });
        }
    };

    Blockly.Blocks.ledMatrix_matrixShowPattern = {
        init: function () {
            this.jsonInit({
                message0: Blockly.Msg.LEDMATRIX_SHOW_PATTERN_5X5,
                args0: [
                    {
                        type: 'input_value',
                        name: 'MATRIX'
                    }
                ],
                colour,
                secondaryColour,
                extensions: ['shape_statement']
            });
        }
    };

    Blockly.Blocks.ledMatrix_matrixShowPattern8x8 = {
        init: function () {
            this.jsonInit({
                message0: Blockly.Msg.LEDMATRIX_SHOW_PATTERN_8X8,
                args0: [
                    {
                        type: 'field_matrix8x8',
                        name: 'MATRIX',
                        matrix: '0000000001000010001001000001100000011000001001000100001000000000'
                    }
                ],
                colour,
                secondaryColour,
                extensions: ['shape_statement']
            });
        }
    };

    Blockly.Blocks.ledMatrix_matrixShowText = {
        init: function () {
            this.jsonInit({
                message0: Blockly.Msg.LEDMATRIX_SHOW_TEXT,
                args0: [
                    {
                        type: 'input_value',
                        name: 'TEXT'
                    }
                ],
                colour,
                secondaryColour,
                extensions: ['shape_statement']
            });
        }
    };

    Blockly.Blocks.ledMatrix_brightnessNumber = {
        init: function () {
            this.jsonInit({
                message0: '%1',
                args0: [
                    {
                        type: 'field_slider',
                        name: 'NUM',
                        value: '8',
                        precision: 1,
                        min: '0',
                        max: '15'
                    }
                ],
                output: 'Number',
                outputShape: Blockly.OUTPUT_SHAPE_ROUND,
                colour: Blockly.Colours.textField,
                colourSecondary: Blockly.Colours.textField,
                colourTertiary: Blockly.Colours.textField
            });
        }
    };

    return Blockly;
}

exports = registerBlocks;
