import './styles.css';
import {
    Application,
    Button,
    Component,
    Flex,
    FlexDirection,
    FlexGroup,
    GameObject,
    Graphics,
    GridLayout,
    Group,
    Input,
    Label,
    LabelStyle,
    Layout,
    ScrollView,
    Textarea,
} from '../../../src';

const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

type Stat = {
    label: string;
    value: string;
    color: number;
};

class Spinner extends Component<Group> {
    speed = 0.018;

    update(dt: number) {
        this.gameObject.rotation += this.speed * dt;
    }
}

class Pulse extends Component<Group> {
    private elapsed = 0;
    strength = 0.035;
    speed = 0.08;

    update(dt: number) {
        this.elapsed += dt;
        const scale = 1 + Math.sin(this.elapsed * this.speed) * this.strength;
        this.gameObject.scaleX = scale;
        this.gameObject.scaleY = scale;
    }
}

class MeterAnimator extends Component<Group> {
    private elapsed = 0;
    fill!: Graphics;
    label!: Label;

    update(dt: number) {
        this.elapsed += dt;
        const progress = (Math.sin(this.elapsed * 0.045) + 1) / 2;
        const width = 36 + progress * 244;
        drawPanel(this.fill, width, 42, 12, 0x2563eb, 0x2563eb);
        this.label.value = `${Math.round(progress * 100)}%`;
    }
}

class ResponsiveBox extends Component<Group> {
    graphic!: Graphics;
    fill = 0xffffff;
    radius = 12;
    stroke = 0x0f172a;
    strokeAlpha = 0.14;

    awake() {
        this.gameObject.emitter.on(GameObject.Event.RESIZE, this.redraw, this);
        this.redraw();
    }

    private redraw() {
        this.graphic.clear()
            .roundRect(0, 0, this.gameObject.width, this.gameObject.height, this.radius)
            .fill(this.fill)
            .stroke({ width: 1, color: this.stroke, alpha: this.strokeAlpha });
    }

    onDestroy() {
        this.gameObject.emitter.off(GameObject.Event.RESIZE, this.redraw, this);
    }
}

class FitToViewport extends Component<Group> {
    margin = 24;

    awake() {
        this.gameObject.parent?.emitter.on(GameObject.Event.RESIZE, this.resize, this);
        this.resize();
    }

    private resize() {
        const parent = this.gameObject.parent;
        if (!parent) {
            return;
        }
        const scale = Math.min(
            1,
            Math.max(0.1, (parent.width - this.margin * 2) / this.gameObject.width),
            Math.max(0.1, (parent.height - this.margin * 2) / this.gameObject.height),
        );
        this.gameObject.scaleX = scale;
        this.gameObject.scaleY = scale;
    }

    onDestroy() {
        this.gameObject.parent?.emitter.off(GameObject.Event.RESIZE, this.resize, this);
    }
}

const viewport = document.querySelector<HTMLMainElement>('#app');

if (!viewport) {
    throw new Error('Missing #app container');
}

const app = new Application();

await app.init({
    resizeTo: viewport,
    backgroundColor: 0xf3f4f6,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
});

viewport.append(app.canvas);

const syncRootSize = () => {
    app.root.width = app.screen.width;
    app.root.height = app.screen.height;
};

syncRootSize();
window.addEventListener('resize', () => requestAnimationFrame(syncRootSize));

const stage = app.root;

function textStyle(options: Partial<ConstructorParameters<typeof LabelStyle>[0]> = {}) {
    return new LabelStyle({
        fill: 0x1f2933,
        fontFamily: FONT,
        fontSize: 14,
        ...options,
    });
}

function makeLabel(parent: Group, value: string, x: number, y: number, options: Partial<ConstructorParameters<typeof LabelStyle>[0]> = {}) {
    return GameObject.instantiate(Label, parent, {
        value,
        x,
        y,
        style: textStyle(options),
    });
}

function drawPanel(target: Graphics, width: number, height: number, radius = 16, fill = 0xffffff, stroke = 0xd4dae2) {
    target.clear()
        .roundRect(0, 0, width, height, radius)
        .fill(fill)
        .stroke({ width: 1, color: stroke });
}

function makeCard(parent: Group, props: Partial<Group>, fill = 0xffffff) {
    const card = GameObject.instantiate(Group, parent, props);
    const background = GameObject.instantiate(Graphics, card);
    drawPanel(background, card.width, card.height, 14, fill);
    return card;
}

function makeButton(parent: Group, label: string, x: number, y: number, width: number, onTap: () => void) {
    const button = GameObject.instantiate(Button, parent, {
        x,
        y,
        width,
        height: 42,
        value: label,
        fontFamily: FONT,
    });
    button.emitter.on('tap', onTap);
    return button;
}

function makeStatCard(parent: Group, stat: Stat) {
    const card = makeCard(parent, { width: 170, height: 92 }, 0xf8fafc);
    const accent = GameObject.instantiate(Graphics, card);
    accent.roundRect(18, 18, 9, 40, 4).fill(stat.color);
    makeLabel(card, stat.value, 42, 16, { fontSize: 24, fontWeight: '700', fill: 0x111827 });
    makeLabel(card, stat.label, 42, 52, { fontSize: 12, fill: 0x64748b });
    return card;
}

function makeTile(parent: Group, label: string, color: number, detail: string) {
    const tile = GameObject.instantiate(Group, parent);
    let restingY = 0;
    const background = GameObject.instantiate(Graphics, tile);
    background.roundRect(0, 0, 136, 82, 12).fill(color).stroke({ width: 1, color: 0x111827, alpha: 0.12 });
    makeLabel(tile, label, 16, 18, { fill: 0xffffff, fontSize: 18, fontWeight: '700' });
    makeLabel(tile, detail, 16, 48, { fill: 0xffffff, fontSize: 12 });
    tile.display.eventMode = 'static';
    tile.display.cursor = 'pointer';
    tile.display.on('pointerover', () => {
        restingY = tile.y;
        tile.y = restingY - 4;
        tile.alpha = 0.94;
    });
    tile.display.on('pointerout', () => {
        tile.y = restingY;
        tile.alpha = 1;
    });
    return tile;
}

const shell = GameObject.instantiate(Group, stage, {
    width: 1120,
    height: 700,
    anchorX: 0.5,
    anchorY: 0.5,
});
shell.addComponent(Layout, { centerX: 0, centerY: 0 });
shell.addComponent(FitToViewport, { margin: 24 });

const shellBackground = GameObject.instantiate(Graphics, shell);
drawPanel(shellBackground, shell.width, shell.height, 22, 0xffffff, 0xcbd5e1);

makeLabel(shell, 'pixif interactive showcase', 34, 28, {
    fill: 0x0f172a,
    fontSize: 32,
    fontWeight: '800',
});
makeLabel(shell, 'A compact scene that combines GameObject, Component, Layout, GridLayout, FlexGroup, Pixi events, and DOM-backed form controls.', 36, 76, {
    fill: 0x64748b,
    fontSize: 14,
});

const badge = GameObject.instantiate(Group, shell, {
    x: 1032,
    y: 58,
    width: 62,
    height: 62,
    anchorX: 0.5,
    anchorY: 0.5,
});
badge.addComponent(Spinner);
GameObject.instantiate(Graphics, badge)
    .roundRect(0, 0, 62, 62, 16)
    .fill(0xfacc15)
    .stroke({ width: 2, color: 0x0f172a, alpha: 0.16 });
makeLabel(badge, 'GO', 16, 20, { fill: 0x0f172a, fontSize: 18, fontWeight: '800' });

const scroll = GameObject.instantiate(ScrollView, shell, {
    x: 34,
    y: 122,
    width: 1052,
    height: 544,
    contentHeight: 980,
});
const content = scroll.content;

const topGrid = GameObject.instantiate(Group, content, {
    x: 0,
    y: 0,
    width: 740,
    height: 92,
});
topGrid.addComponent(GridLayout, {
    col: 4,
    gridWidth: 170,
    gridHeight: 92,
    gapHorizontal: 20,
    gapVertical: 0,
});

[
    { label: 'nodes in scene', value: '42', color: 0x2563eb },
    { label: 'layout systems', value: '3', color: 0x10b981 },
    { label: 'DOM inputs', value: '2', color: 0xf97316 },
    { label: 'ticker workers', value: '2', color: 0x8b5cf6 },
].forEach((stat) => makeStatCard(topGrid, stat));

const scrollCard = makeCard(content, { x: 792, y: 0, width: 260, height: 92 }, 0xfffbeb);
makeLabel(scrollCard, 'ScrollView', 18, 16, { fontSize: 22, fontWeight: '800', fill: 0x92400e });
makeLabel(scrollCard, 'Wheel or drag this page.', 18, 52, { fill: 0x92400e, fontSize: 13 });

const gridCard = makeCard(content, { x: 0, y: 122, width: 474, height: 260 }, 0xf8fafc);
makeLabel(gridCard, 'GridLayout feature tiles', 20, 18, { fontSize: 20, fontWeight: '800', fill: 0x0f172a });
makeLabel(gridCard, 'Hover each tile to see Pixi pointer events on pixif GameObjects.', 20, 50, { fill: 0x64748b, fontSize: 13 });

const featureGrid = GameObject.instantiate(Group, gridCard, {
    x: 20,
    y: 86,
    width: 428,
    height: 158,
});
featureGrid.addComponent(GridLayout, {
    col: 3,
    gridWidth: 136,
    gridHeight: 82,
    gapHorizontal: 10,
    gapVertical: 12,
});

[
    ['Layout', 0x2563eb, 'center + stretch'],
    ['Grid', 0x0f766e, 'cell placement'],
    ['Flex', 0xdb2777, 'proportional'],
    ['Ticker', 0x7c3aed, 'component update'],
    ['Input', 0xea580c, 'DOM overlay'],
    ['Events', 0x334155, 'pointer tap'],
].forEach(([label, color, detail]) => makeTile(featureGrid, label as string, color as number, detail as string));

const flexCard = makeCard(content, { x: 498, y: 122, width: 554, height: 260 }, 0xffffff);
makeLabel(flexCard, 'FlexGroup distribution', 20, 18, { fontSize: 20, fontWeight: '800', fill: 0x0f172a });
makeLabel(flexCard, 'Child widths are assigned by Flex.grow inside one row container.', 20, 50, { fill: 0x64748b, fontSize: 13 });

const flexRow = GameObject.instantiate(Group, flexCard, { x: 20, y: 86, width: 514, height: 68 });
flexRow.addComponent(FlexGroup, { direction: FlexDirection.ROW, gap: 12 });

[
    ['grow 1', 1, 0x93c5fd],
    ['grow 2', 2, 0x86efac],
    ['fixed', 0, 0xfde68a],
].forEach(([label, grow, color]) => {
    const item = GameObject.instantiate(Group, flexRow, { width: grow ? 80 : 126, height: 68 });
    if (grow) {
        item.addComponent(Flex, { grow: grow as number });
    }
    const background = GameObject.instantiate(Graphics, item);
    item.addComponent(ResponsiveBox, { graphic: background, fill: color as number });
    makeLabel(item, label as string, 16, 24, { fill: 0x0f172a, fontSize: 15, fontWeight: '700' });
});

const meter = GameObject.instantiate(Group, flexCard, { x: 20, y: 184, width: 300, height: 42 });
GameObject.instantiate(Graphics, meter)
    .roundRect(0, 0, 300, 42, 12)
    .fill(0xe2e8f0);
const meterFill = GameObject.instantiate(Group, meter, { width: 160, height: 42 });
const meterFillGraphic = GameObject.instantiate(Graphics, meterFill);
drawPanel(meterFillGraphic, meterFill.width, meterFill.height, 12, 0x2563eb, 0x2563eb);
const meterLabel = makeLabel(meter, '50%', 334, 11, { fill: 0x0f172a, fontSize: 16, fontWeight: '800' });
meter.addComponent(MeterAnimator, { fill: meterFillGraphic, label: meterLabel });

const pulseDot = GameObject.instantiate(Group, flexCard, { x: 464, y: 205, width: 42, height: 42, anchorX: 0.5, anchorY: 0.5 });
pulseDot.addComponent(Pulse);
GameObject.instantiate(Graphics, pulseDot).circle(21, 21, 21).fill(0x22c55e);
makeLabel(flexCard, 'Component update', 378, 196, { fill: 0x64748b, fontSize: 13 });

const formCard = makeCard(content, { x: 0, y: 406, width: 474, height: 138 }, 0xffffff);
makeLabel(formCard, 'DOM-backed form controls', 20, 18, { fontSize: 20, fontWeight: '800', fill: 0x0f172a });
makeLabel(formCard, 'Input and Textarea remain aligned to the canvas through scroll/resize.', 20, 50, { fill: 0x64748b, fontSize: 13 });

const nameInput = GameObject.instantiate(Input, formCard, {
    x: 20,
    y: 82,
    width: 190,
    height: 38,
    fontSize: 15,
});
nameInput.value = 'pixif';
nameInput.backgroundColor = 0xf8fafc;

const notesInput = GameObject.instantiate(Textarea, formCard, {
    x: 228,
    y: 82,
    width: 224,
    height: 38,
    fontSize: 14,
});
notesInput.value = 'Resize me with the window.';
notesInput.backgroundColor = 0xf8fafc;
notesInput.lineHeight = 16;

const actionCard = makeCard(content, { x: 498, y: 406, width: 554, height: 138 }, 0xf8fafc);
makeLabel(actionCard, 'Interactive state', 20, 18, { fontSize: 20, fontWeight: '800', fill: 0x0f172a });
const stateLabel = makeLabel(actionCard, 'Click a command to update this label.', 20, 54, { fill: 0x475569, fontSize: 15 });

let actionCount = 0;
makeButton(actionCard, 'Increment', 20, 82, 130, () => {
    actionCount += 1;
    stateLabel.value = `Button tapped ${actionCount} time${actionCount === 1 ? '' : 's'}.`;
});
makeButton(actionCard, 'Clear form', 168, 82, 130, () => {
    nameInput.value = '';
    notesInput.value = '';
    stateLabel.value = 'Form values cleared through pixif objects.';
});
makeButton(actionCard, 'Focus input', 316, 82, 130, () => {
    nameInput.focus();
    stateLabel.value = 'Input focused from a Pixi event handler.';
});

const lifecycleCard = makeCard(content, { x: 0, y: 584, width: 330, height: 170 }, 0xf0fdfa);
makeLabel(lifecycleCard, 'Composite structure', 20, 20, { fontSize: 20, fontWeight: '800', fill: 0x134e4a });
makeLabel(lifecycleCard, 'ScrollView is a Group subclass that owns mask, content, event handling, and a scrollbar.', 20, 56, {
    fill: 0x0f766e,
    fontSize: 13,
    wordWrap: true,
    wordWrapWidth: 286,
});
makeLabel(lifecycleCard, 'Its content node accepts regular pixif children.', 20, 116, { fill: 0x115e59, fontSize: 13 });

const resizeCard = makeCard(content, { x: 360, y: 584, width: 330, height: 170 }, 0xeff6ff);
makeLabel(resizeCard, 'Viewport behavior', 20, 20, { fontSize: 20, fontWeight: '800', fill: 0x1e3a8a });
makeLabel(resizeCard, 'The outer shell still uses Layout and FitToViewport, while the inner content can extend beyond the visible area.', 20, 56, {
    fill: 0x1d4ed8,
    fontSize: 13,
    wordWrap: true,
    wordWrapWidth: 286,
});
makeLabel(resizeCard, 'Resize the browser to keep the whole scene framed.', 20, 130, { fill: 0x1e40af, fontSize: 13 });

const dataCard = makeCard(content, { x: 720, y: 584, width: 332, height: 170 }, 0xfdf2f8);
makeLabel(dataCard, 'Long content area', 20, 20, { fontSize: 20, fontWeight: '800', fill: 0x831843 });
[
    'Wheel input is clamped.',
    'Drag input maps to scroll offset.',
    'The scrollbar tracks progress.',
].forEach((value, index) => {
    GameObject.instantiate(Graphics, dataCard)
        .circle(28, 66 + index * 30, 4)
        .fill(0xdb2777);
    makeLabel(dataCard, value, 42, 56 + index * 30, { fill: 0x9d174d, fontSize: 13 });
});

const finalCard = makeCard(content, { x: 0, y: 792, width: 1052, height: 148 }, 0xffffff);
makeLabel(finalCard, 'Scrollable content page', 24, 22, { fontSize: 24, fontWeight: '800', fill: 0x0f172a });
makeLabel(finalCard, 'This section sits below the initial viewport and confirms that complex pixif UI can be composed as a scrollable page instead of a fixed showcase.', 24, 64, {
    fill: 0x475569,
    fontSize: 15,
    wordWrap: true,
    wordWrapWidth: 860,
});
makeButton(finalCard, 'Back to top', 878, 52, 130, () => {
    scroll.scrollTo(0);
});

scroll.refreshContentHeight();
