import centerContainerTsSource from 'pixifact/builtin-scenes/CenterContainer.ts?raw';
import controlTsSource from 'pixifact/builtin-scenes/Control.ts?raw';
import flexItemTsSource from 'pixifact/builtin-scenes/FlexItem.ts?raw';
import flexLayoutTsSource from 'pixifact/builtin-scenes/FlexLayout.ts?raw';
import hBoxContainerTsSource from 'pixifact/builtin-scenes/HBoxContainer.ts?raw';
import marginContainerTsSource from 'pixifact/builtin-scenes/MarginContainer.ts?raw';
import vBoxContainerTsSource from 'pixifact/builtin-scenes/VBoxContainer.ts?raw';
import type { BuiltinSceneScriptSources } from 'pixifact/compiler';

export const builtinSceneScriptSources: BuiltinSceneScriptSources = {
    CenterContainer: centerContainerTsSource,
    Control: controlTsSource,
    FlexItem: flexItemTsSource,
    FlexLayout: flexLayoutTsSource,
    HBoxContainer: hBoxContainerTsSource,
    MarginContainer: marginContainerTsSource,
    VBoxContainer: vBoxContainerTsSource,
};
