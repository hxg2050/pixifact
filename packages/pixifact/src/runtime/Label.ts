import { Text } from 'pixi.js';
import {
    TextBoxControl,
    type TextBoxAlign,
    type TextBoxFontWeight,
    type TextBoxOptions,
    type TextBoxOverflow,
} from './TextBoxControl';

export type LabelAlign = TextBoxAlign;
export type LabelOverflow = TextBoxOverflow;
export type LabelFontWeight = TextBoxFontWeight;
export type LabelOptions = TextBoxOptions;

export class Label extends TextBoxControl<Text> {
    constructor(options: LabelOptions = {}) {
        super(options, (textOptions) => new Text(textOptions));
    }
}
