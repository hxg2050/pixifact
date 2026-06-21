import { Mesh, MeshGeometry, ObservablePoint, Rectangle, Texture, type MeshOptions, type Size } from 'pixi.js';
import { frameLayoutProp, setFrameLayoutProp } from './frameLayoutAccessors';
import type { FrameLayoutProp } from './frameLayout';

export type ImageFit = 'stretch' | 'contain' | 'cover' | 'none';

export type ImageOptions = Omit<MeshOptions, 'geometry' | 'texture'> & {
    texture?: Texture;
    width?: number;
    height?: number;
    fit?: ImageFit;
    anchorX?: number;
    anchorY?: number;
};

const quadIndices = new Uint32Array([0, 1, 2, 0, 2, 3]);
const initializedImages = new WeakSet<object>();

export class Image extends Mesh {
    #width = 96;
    #height = 96;
    #fit: ImageFit = 'stretch';
    readonly #anchor = new ObservablePoint({
        _onUpdate: () => this.#syncGeometry(),
    });

    constructor(options: ImageOptions = {}) {
        const {
            texture,
            width,
            height,
            fit,
            anchorX,
            anchorY,
            ...meshOptions
        } = options;
        super({
            ...meshOptions,
            texture: texture ?? Texture.EMPTY,
            geometry: new MeshGeometry({
                positions: new Float32Array(8),
                uvs: new Float32Array(8),
                indices: quadIndices,
            }),
        });

        initializedImages.add(this);
        this.texture.on('update', this.#syncGeometry, this);
        this.#width = width ?? this.#width;
        this.#height = height ?? this.#height;
        this.#fit = fit ?? this.#fit;
        this.#anchor.set(anchorX ?? 0, anchorY ?? 0);
        this.#syncHitArea();
        this.#syncGeometry();
    }

    override get width() {
        return this.#width;
    }

    override set width(value: number) {
        this.#setBoxSize(value, this.#height);
    }

    override get height() {
        return this.#height;
    }

    override set height(value: number) {
        this.#setBoxSize(this.#width, value);
    }

    override getSize(out: Size = { width: 0, height: 0 }) {
        out.width = this.#width;
        out.height = this.#height;
        return out;
    }

    override setSize(value: number | { width: number; height?: number }, height?: number) {
        if (typeof value === 'number') {
            this.#setBoxSize(value, height ?? value);
        } else {
            this.#setBoxSize(value.width, value.height ?? value.width);
        }
    }

    override get texture() {
        return super.texture;
    }

    override set texture(value: Texture) {
        if (!initializedImages.has(this)) {
            super.texture = value;
            return;
        }
        const currentTexture = super.texture;
        currentTexture?.off('update', this.#syncGeometry, this);
        super.texture = value;
        value.on('update', this.#syncGeometry, this);
        this.#syncGeometry();
    }

    get fit() {
        return this.#fit;
    }

    set fit(value: ImageFit) {
        this.#fit = value;
        this.#syncGeometry();
    }

    get anchor() {
        return this.#anchor;
    }

    set anchor(value: { x: number; y: number } | number) {
        if (typeof value === 'number') {
            this.#anchor.set(value);
        } else {
            this.#anchor.set(value.x, value.y);
        }
    }

    get left() {
        return this.#layoutProp('left');
    }

    set left(value: number | undefined) {
        this.#setLayoutProp('left', value);
    }

    get right() {
        return this.#layoutProp('right');
    }

    set right(value: number | undefined) {
        this.#setLayoutProp('right', value);
    }

    get top() {
        return this.#layoutProp('top');
    }

    set top(value: number | undefined) {
        this.#setLayoutProp('top', value);
    }

    get bottom() {
        return this.#layoutProp('bottom');
    }

    set bottom(value: number | undefined) {
        this.#setLayoutProp('bottom', value);
    }

    get horizontal() {
        return this.#layoutProp('horizontal');
    }

    set horizontal(value: number | undefined) {
        this.#setLayoutProp('horizontal', value);
    }

    get vertical() {
        return this.#layoutProp('vertical');
    }

    set vertical(value: number | undefined) {
        this.#setLayoutProp('vertical', value);
    }

    #layoutProp(prop: FrameLayoutProp) {
        return frameLayoutProp(this, prop);
    }

    #setLayoutProp(prop: FrameLayoutProp, value: number | undefined) {
        setFrameLayoutProp(this, prop, value);
    }

    #setBoxSize(width: number, height: number) {
        this.#width = width;
        this.#height = height;
        this.#syncHitArea();
        this.#syncGeometry();
    }

    #syncHitArea() {
        const bounds = this.#boxBounds();
        this.hitArea = bounds;
        this.boundsArea = bounds;
    }

    #syncGeometry() {
        this.#syncPositions();
        this.#syncUvs();
        this.geometry.positions = this.geometry.positions;
        this.geometry.uvs = this.geometry.uvs;
    }

    #syncPositions() {
        const positions = this.geometry.positions;
        const draw = this.#drawRect();
        positions[0] = draw.x;
        positions[1] = draw.y;
        positions[2] = draw.x + draw.width;
        positions[3] = draw.y;
        positions[4] = draw.x + draw.width;
        positions[5] = draw.y + draw.height;
        positions[6] = draw.x;
        positions[7] = draw.y + draw.height;
    }

    #syncUvs() {
        const uvs = this.geometry.uvs;
        const crop = this.#uvCrop();
        uvs[0] = crop.u0;
        uvs[1] = crop.v0;
        uvs[2] = crop.u1;
        uvs[3] = crop.v0;
        uvs[4] = crop.u1;
        uvs[5] = crop.v1;
        uvs[6] = crop.u0;
        uvs[7] = crop.v1;
    }

    #drawRect() {
        const box = this.#boxBounds();
        if (this.#fit === 'contain') {
            const size = containSize(this.texture.width, this.texture.height, this.#width, this.#height);
            return centeredRect(size.width, size.height, box.x, box.y, box.width, box.height);
        }
        if (this.#fit === 'none') {
            return new Rectangle(box.x, box.y, this.texture.width, this.texture.height);
        }
        return box;
    }

    #uvCrop() {
        if (this.#fit !== 'cover') {
            return { u0: 0, v0: 0, u1: 1, v1: 1 };
        }
        return coverUvCrop(this.texture.width, this.texture.height, this.#width, this.#height);
    }

    #boxBounds() {
        return new Rectangle(
            -this.#anchor.x * this.#width,
            -this.#anchor.y * this.#height,
            this.#width,
            this.#height,
        );
    }
}

function containSize(textureWidth: number, textureHeight: number, boxWidth: number, boxHeight: number) {
    if (textureWidth <= 0 || textureHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
        return { width: 0, height: 0 };
    }
    const scale = Math.min(boxWidth / textureWidth, boxHeight / textureHeight);
    return {
        width: textureWidth * scale,
        height: textureHeight * scale,
    };
}

function coverUvCrop(textureWidth: number, textureHeight: number, boxWidth: number, boxHeight: number) {
    if (textureWidth <= 0 || textureHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
        return { u0: 0, v0: 0, u1: 1, v1: 1 };
    }
    const textureRatio = textureWidth / textureHeight;
    const boxRatio = boxWidth / boxHeight;
    if (textureRatio > boxRatio) {
        const visibleWidth = boxRatio / textureRatio;
        const inset = (1 - visibleWidth) / 2;
        return { u0: inset, v0: 0, u1: 1 - inset, v1: 1 };
    }
    const visibleHeight = textureRatio / boxRatio;
    const inset = (1 - visibleHeight) / 2;
    return { u0: 0, v0: inset, u1: 1, v1: 1 - inset };
}

function centeredRect(
    width: number,
    height: number,
    boxX: number,
    boxY: number,
    boxWidth: number,
    boxHeight: number,
) {
    return new Rectangle(
        boxX + (boxWidth - width) / 2,
        boxY + (boxHeight - height) / 2,
        width,
        height,
    );
}
