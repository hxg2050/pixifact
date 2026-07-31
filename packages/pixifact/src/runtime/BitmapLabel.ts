import { BitmapText } from 'pixi.js';
import {
    TextBoxControl,
    type TextBoxAlign,
    type TextBoxFontWeight,
    type TextBoxOptions,
    type TextBoxOverflow,
} from './TextBoxControl';

export type BitmapLabelAlign = TextBoxAlign;
export type BitmapLabelOverflow = TextBoxOverflow;
export type BitmapLabelFontWeight = TextBoxFontWeight;
export type BitmapLabelOptions = TextBoxOptions;

export class BitmapLabel extends TextBoxControl<BitmapText> {
    constructor(options: BitmapLabelOptions = {}) {
        super(options, (textOptions) => new BitmapText(textOptions));
    }
}
