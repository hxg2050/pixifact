import './styles.css';
import { Application, Component, GameObject, Graphics, GridLayout, Group, Input, Label, LabelStyle, Layout } from '../../../src';

class Spinner extends Component<Group> {
    speed = 0.018;

    update(dt: number) {
        this.gameObject.rotation += this.speed * dt;
    }
}

const viewport = document.querySelector<HTMLMainElement>('#app');

if (!viewport) {
    throw new Error('Missing #app container');
}

const app = new Application();

await app.init({
    resizeTo: viewport,
    backgroundColor: 0xf4f0e6,
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

const panel = GameObject.instantiate(Group, stage, {
    width: 720,
    height: 460,
    anchorX: 0.5,
    anchorY: 0.5,
});
panel.addComponent(Layout, { centerX: 0, centerY: 0 });

const panelBackground = GameObject.instantiate(Graphics, panel);
panelBackground.roundRect(0, 0, panel.width, panel.height, 18).fill(0xffffff).stroke({ width: 2, color: 0x2f3437, alpha: 0.18 });

GameObject.instantiate(Label, panel, {
    value: 'pixif basic scene',
    x: 32,
    y: 28,
    style: new LabelStyle({
        fill: 0x23272a,
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: 30,
        fontWeight: '700',
    }),
});

GameObject.instantiate(Label, panel, {
    value: 'GameObject, Component, Layout, GridLayout and DOM-backed Input working together.',
    x: 34,
    y: 72,
    style: new LabelStyle({
        fill: 0x586066,
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: 14,
    }),
});

const rotatingBadge = GameObject.instantiate(Group, panel, {
    x: 635,
    y: 62,
    width: 64,
    height: 64,
    anchorX: 0.5,
    anchorY: 0.5,
});
rotatingBadge.addComponent(Spinner);

const rotatingBadgeBackground = GameObject.instantiate(Graphics, rotatingBadge);
rotatingBadgeBackground.roundRect(0, 0, rotatingBadge.width, rotatingBadge.height, 14).fill(0xffc857).stroke({ width: 2, color: 0x2f3437, alpha: 0.18 });

GameObject.instantiate(Label, rotatingBadge, {
    value: 'GO',
    x: 16,
    y: 20,
    style: new LabelStyle({
        fill: 0x23272a,
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: 18,
        fontWeight: '700',
    }),
});

const grid = GameObject.instantiate(Group, panel, {
    x: 34,
    y: 126,
    width: 408,
    height: 190,
});
grid.addComponent(GridLayout, {
    col: 2,
    gridWidth: 118,
    gridHeight: 76,
    gapHorizontal: 18,
    gapVertical: 18,
});

const swatches = [
    { label: 'Label', color: 0x3a86ff },
    { label: 'Layout', color: 0x06d6a0 },
    { label: 'Grid', color: 0xef476f },
    { label: 'Ticker', color: 0xffc857 },
    { label: 'Input', color: 0x8338ec },
    { label: 'Events', color: 0x2f3437 },
];

for (const item of swatches) {
    const tile = GameObject.instantiate(Group, grid);
    const tileBackground = GameObject.instantiate(Graphics, tile);
    tileBackground.roundRect(0, 0, 118, 76, 10).fill(item.color).stroke({ width: 1, color: 0x000000, alpha: 0.1 });

    GameObject.instantiate(Label, tile, {
        value: item.label,
        x: 14,
        y: 26,
        style: new LabelStyle({
            fill: 0xffffff,
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: 18,
            fontWeight: '700',
        }),
    });
}

const formPanel = GameObject.instantiate(Group, panel, {
    x: 474,
    y: 126,
    width: 210,
    height: 190,
});

const formBackground = GameObject.instantiate(Graphics, formPanel);
formBackground.roundRect(0, 0, formPanel.width, formPanel.height, 12).fill(0xf7f9fb).stroke({ width: 1, color: 0x2f3437, alpha: 0.14 });

GameObject.instantiate(Label, formPanel, {
    value: 'DOM input',
    x: 18,
    y: 18,
    style: new LabelStyle({
        fill: 0x23272a,
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: 18,
        fontWeight: '700',
    }),
});

GameObject.instantiate(Label, formPanel, {
    value: 'Click the field and type.',
    x: 18,
    y: 50,
    style: new LabelStyle({
        fill: 0x69737a,
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: 13,
    }),
});

const nameInput = GameObject.instantiate(Input, formPanel, {
    x: 18,
    y: 88,
    width: 174,
    height: 44,
    fontSize: 16,
});
nameInput.backgroundColor = 0xffffff;

GameObject.instantiate(Label, panel, {
    value: 'Resize the window: the centered panel is managed by Layout.',
    x: 34,
    y: 394,
    style: new LabelStyle({
        fill: 0x586066,
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: 14,
    }),
});
