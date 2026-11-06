import { Assets, type Application, type Ticker } from 'pixi.js';
import { createThreeLayer } from '@pixifact/three';
import { AmbientLight, Color, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, type BufferGeometry } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Hud } from './scenes/Hud';

export async function startGame(app: Application, hud: Hud) {
    const scene = new Scene();
    scene.background = new Color(0x172331);
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(3, 2, 5);
    scene.add(new AmbientLight(0xffffff, 2));
    const sun = new DirectionalLight(0xffffff, 3);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    const floorGeometry = new PlaneGeometry(100, 100);
    const floorMaterial = new MeshStandardMaterial({ color: 0x213247, roughness: 1 });
    const floor = new Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.2;
    scene.add(floor);
    const modelUrl = Assets.resolver.resolve('resources/models/gem.gltf').src!;
    const gltf = await new GLTFLoader().loadAsync(modelUrl);
    scene.add(gltf.scene);
    const model = gltf.scene.children[0] as Mesh<BufferGeometry, MeshStandardMaterial>;
    const layer = createThreeLayer(app, { scene, camera });
    const controls = new OrbitControls(camera, layer.input);
    controls.enableDamping = true;
    controls.minDistance = 3;
    controls.maxDistance = 12;
    let paused = false;
    let picks = 0;
    const toggle = () => {
        paused = !paused;
        hud.toggleText.text = paused ? '继续旋转' : '暂停旋转';
    };
    const pick = (event: Event) => {
        if (layer.raycast(event as PointerEvent, [model]).length) {
            picks++;
            model.material.color.setHex(picks % 2 ? 0x65b9d0 : 0xe2b367);
        }
    };
    const update = (ticker: Ticker) => {
        if (!paused) gltf.scene.rotation.y += ticker.deltaMS / 1500;
        controls.update(ticker.deltaMS / 1000);
    };
    hud.toggle.on('pointertap', toggle);
    layer.input.addEventListener('pointerdown', pick);
    app.ticker.add(update);
    return {
        layer,
        getState: () => ({ paused, picks, camera: camera.position.toArray() }),
        destroy() {
            app.ticker.remove(update);
            hud.toggle.off('pointertap', toggle);
            controls.dispose();
            layer.destroy();
            model.geometry.dispose();
            model.material.dispose();
            floorGeometry.dispose();
            floorMaterial.dispose();
        },
    };
}
