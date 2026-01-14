import { Input } from "./Input";

export class Textarea extends Input {

    set lineHeight(val: number) {
        this._labelStyle.lineHeight = val;
        this.element.style.lineHeight = val + 'px';
    }
    get lineHeight() {
        return this._labelStyle.lineHeight;
    }

    protected _padding = [6, 6, 6, 6];
    protected createElement(): void {
        this.element = document.createElement('textarea')
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
        this.value.x = this.paddingLeft;
        this.value.y = this.paddingTop;
        this._labelStyle.wordWrapWidth = this.width - this.paddingLeft - this.paddinRight;
        this.updateMask();
    }
}