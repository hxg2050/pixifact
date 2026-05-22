import type {
    SceneClassDecorator,
    SceneDecoratorOptions,
    SceneEventDecoratorOptions,
    SceneMemberDecorator,
    ScenePropDecoratorOptions,
    SceneSlotDecoratorOptions,
} from './spec';

export function scene(path: string): SceneClassDecorator;
export function scene(options: SceneDecoratorOptions): SceneClassDecorator;
export function scene(_options: string | SceneDecoratorOptions): SceneClassDecorator {
    return noopClassDecorator;
}

export function prop(_options: ScenePropDecoratorOptions): SceneMemberDecorator {
    return noopMemberDecorator;
}

export function event(_options: SceneEventDecoratorOptions = {}): SceneMemberDecorator {
    return noopMemberDecorator;
}

export function slot(_options: SceneSlotDecoratorOptions = {}): SceneMemberDecorator {
    return noopMemberDecorator;
}

const noopClassDecorator = (() => undefined) as SceneClassDecorator;
const noopMemberDecorator = (() => undefined) as SceneMemberDecorator;
