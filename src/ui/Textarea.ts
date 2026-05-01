import { Input } from "./Input";

export class Textarea extends Input {

    set lineHeight(val: number) {
        this._labelStyle.lineHeight = val;
        if (this.element) {
            this.element.style.lineHeight = val + 'px';
        }
        this._isUpdateElementSize = true;
    }
    get lineHeight() {
        return this._labelStyle.lineHeight;
    }

    protected _padding = [6, 6, 6, 6];
    protected createElement(): void {
        this.element = document.createElement('textarea');
        this.element.style.resize = 'none';
        this.element.style.overflow = 'hidden';
    }

    public render() {
        super.render()
        this.lineHeight = this._labelStyle.lineHeight;
        this._labelStyle.wordWrap = true;
        this._labelStyle.breakWords = true;
    }

    public resize(): void {
        this._isResize = false;
        this._isUpdateElementSize = true;
        this.valueLabel.x = this.paddingLeft;
        this.valueLabel.y = this.paddingTop;
        this._labelStyle.wordWrapWidth = this.contentWidth;
        this.updateMask();
    }
}
