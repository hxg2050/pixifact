import { Container, Text } from 'pixi.js';
import { part, scene } from 'pixifact/compiler';
import { Button } from './Button';

@scene('./scenes/MainMenu.scene')
export class MainMenu extends Container {
    @part()
    protected declare bodyText: Text;

    @part()
    protected declare startButton: Button;

    onMounted() {
        this.startButton.click.connect(() => {
            this.startGame();
        });
    }

    startGame() {
        this.startButton.label = 'Started';
        this.bodyText.text = 'Click handled through Button public event.\nThe parent scene never touches Button internals.';
    }
}
