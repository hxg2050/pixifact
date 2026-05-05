import type { PrefabSpec } from "../prefab";
import type { CommandResult } from "./applyCommand";
import { applyCommand } from "./applyCommand";
import type { EditorCommand } from "./Command";
import type { CommandValidationContext } from "./validateCommand";

export class CommandStack {
    private undoStack: EditorCommand[] = [];
    private redoStack: EditorCommand[] = [];

    get canUndo() {
        return this.undoStack.length > 0;
    }

    get canRedo() {
        return this.redoStack.length > 0;
    }

    execute(prefab: PrefabSpec, command: EditorCommand, context: CommandValidationContext = {}): CommandResult {
        const result = applyCommand(prefab, command, context);
        if (result.ok) {
            this.undoStack.push(result.inverse);
            this.redoStack.length = 0;
        }
        return result;
    }

    undo(prefab: PrefabSpec, context: CommandValidationContext = {}): CommandResult | undefined {
        const command = this.undoStack.pop();
        if (!command) {
            return undefined;
        }

        const result = applyCommand(prefab, command, context);
        if (result.ok) {
            this.redoStack.push(result.inverse);
        }
        return result;
    }

    redo(prefab: PrefabSpec, context: CommandValidationContext = {}): CommandResult | undefined {
        const command = this.redoStack.pop();
        if (!command) {
            return undefined;
        }

        const result = applyCommand(prefab, command, context);
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
