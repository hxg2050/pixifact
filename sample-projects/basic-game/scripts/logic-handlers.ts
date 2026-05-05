export interface BasicGameRuntimeContext {
    state: {
        battleStarted?: boolean;
        inventoryOpen?: boolean;
        selectedSkill?: string;
    };
    emitAction?: (action: string, payload?: unknown) => void;
    setNodeVisible?: (node: string, visible: boolean) => void;
}

export function handleStartBattle(context: BasicGameRuntimeContext) {
    context.state.battleStarted = true;
    context.emitAction?.('startBattle');
}

export function handleOpenInventory(context: BasicGameRuntimeContext) {
    context.state.inventoryOpen = true;
    context.emitAction?.('openInventory');
}

export function handleCastSkill(context: BasicGameRuntimeContext, skill: string) {
    context.state.selectedSkill = skill;
    context.emitAction?.('castSkill', { skill });
}
