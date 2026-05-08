import type { SceneSpec } from "../scene";
import type { CommandResult } from "./applyCommand";
import { applyCommand } from "./applyCommand";
import type { SceneCommand } from "./Command";
import type { CommandValidationContext } from "./validateCommand";

export class CommandStack {
    private undoStack: SceneCommand[] = [];
    private redoStack: SceneCommand[] = [];

    get canUndo() {
        return this.undoStack.length > 0;
    }

    get canRedo() {
        return this.redoStack.length > 0;
    }

    execute(scene: SceneSpec, command: SceneCommand, context: CommandValidationContext = {}): CommandResult {
        const result = applyCommand(scene, command, context);
        if (result.ok) {
            this.undoStack.push(result.inverse);
            this.redoStack.length = 0;
        }
        return result;
    }

    undo(scene: SceneSpec, context: CommandValidationContext = {}): CommandResult | undefined {
        const command = this.undoStack.pop();
        if (!command) {
            return undefined;
        }

        const result = applyCommand(scene, command, context);
        if (result.ok) {
            this.redoStack.push(result.inverse);
        }
        return result;
    }

    redo(scene: SceneSpec, context: CommandValidationContext = {}): CommandResult | undefined {
        const command = this.redoStack.pop();
        if (!command) {
            return undefined;
        }

        const result = applyCommand(scene, command, context);
        if (result.ok) {
            this.undoStack.push(result.inverse);
        }
        return result;
    }

    clear() {
        this.undoStack.length = 0;
        this.redoStack.length = 0;
    }
}
