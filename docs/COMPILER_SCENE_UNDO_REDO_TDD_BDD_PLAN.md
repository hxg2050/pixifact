# Compiler Scene Undo / Redo TDD-BDD Plan

本文档定义 compiler `.scene` 撤销 / 重做能力的行为规格、测试驱动顺序和验收标准。

相关全局规范见 [TDD.md](./TDD.md) 和 [BDD.md](./BDD.md)。

## 1. 范围

本计划只覆盖 Pixifact Editor 内部的 compiler `.scene` authoring。

包含：

- Inspector 修改 Scene 属性。
- Inspector 修改节点 id、props、events、slot name。
- Hierarchy 新增节点。
- Hierarchy 删除节点。
- Hierarchy 移动节点。
- 从 Project / node library / scene tool 拖入层级。
- 顶部栏撤销 / 重做按钮。
- 全局撤销 / 重做快捷键。
- 保存状态 dirty 判断。

不包含：

- 新建 Scene 文件。
- 新建文件夹。
- 打开文件。
- 保存文件本身。
- 项目文件树选择状态。
- Dockview 布局状态。
- 外部文件变更的合并。
- Editor live bridge mutation。

## 2. BDD 场景

### BDD-UNDO-001 修改 Scene 属性后撤销

Feature: Undo Scene property edits

```gherkin
Scenario: User undoes a Scene width change
  Given a compiler .scene is open in Pixifact Editor
  And the Scene width is 960
  When the user changes the Scene width to 1280 in Inspector
  Then the viewport and Inspector show width 1280
  And the Scene is dirty
  When the user clicks Undo
  Then the Scene width returns to 960
  And the viewport and Inspector show width 960
```

TDD 入口：

- Command layer: `tests/compiler-scene-commands.test.ts`
- Editor integration: `tests/editor-workbench-ui.test.ts`

### BDD-UNDO-002 修改节点属性后撤销 / 重做

Feature: Undo and redo node property edits

```gherkin
Scenario: User undoes and redoes a Text value change
  Given a compiler .scene contains a Text node named "label"
  When the user changes the text value from "Start" to "Play"
  Then Undo is enabled
  When the user clicks Undo
  Then the text value returns to "Start"
  And Redo is enabled
  When the user clicks Redo
  Then the text value becomes "Play"
```

TDD 入口：

- `tests/compiler-scene-commands.test.ts`
- `tests/editor-workbench-ui.test.ts`

### BDD-UNDO-003 新增节点后撤销

Feature: Undo inserted hierarchy nodes

```gherkin
Scenario: User drops a node template into the hierarchy and undoes it
  Given a compiler .scene is open
  When the user drops a Text template into the hierarchy blank area
  Then a Text node is added under the Scene root
  When the user clicks Undo
  Then the added Text node is removed
```

TDD 入口：

- `tests/compiler-scene-commands.test.ts`
- `tests/editor-workbench-ui.test.ts`

### BDD-UNDO-004 删除节点后撤销

Feature: Undo deleted hierarchy nodes

```gherkin
Scenario: User deletes a node and restores it
  Given a compiler .scene contains a node "title"
  When the user deletes "title"
  Then "title" is removed from the hierarchy
  When the user clicks Undo
  Then "title" is restored to the same parent and index
```

TDD 入口：

- `tests/compiler-scene-commands.test.ts`
- `tests/editor-workbench-ui.test.ts`

### BDD-UNDO-005 移动节点后撤销

Feature: Undo hierarchy reordering

```gherkin
Scenario: User moves a node and undoes the move
  Given a compiler .scene contains "title" before "button"
  When the user drags "button" before "title"
  Then "button" appears before "title"
  When the user clicks Undo
  Then "title" appears before "button" again
```

TDD 入口：

- `tests/compiler-scene-commands.test.ts`
- `tests/editor-workbench-ui.test.ts`

### BDD-UNDO-006 保存点 dirty 状态

Feature: Dirty state follows saved revision

```gherkin
Scenario: User undoes back to the saved revision
  Given a compiler .scene is open and saved
  When the user changes a node prop
  Then the Scene is dirty
  When the user clicks Undo
  Then the Scene returns to the saved content
  And the Scene is not dirty
```

TDD 入口：

- `tests/compiler-scene-commands.test.ts`
- `tests/editor-workbench-ui.test.ts`

### BDD-UNDO-007 新修改清空 redo

Feature: New edits clear redo history

```gherkin
Scenario: User edits after undo
  Given the user changed a node from "Start" to "Play"
  And clicked Undo
  When the user changes the same node to "Launch"
  Then Redo is disabled
  And clicking Redo does not restore "Play"
```

TDD 入口：

- `tests/compiler-scene-commands.test.ts`

### BDD-UNDO-008 快捷键

Feature: Keyboard shortcuts trigger Scene undo and redo

```gherkin
Scenario: User triggers undo with keyboard
  Given a compiler .scene has an undoable edit
  When the user presses the platform undo shortcut
  Then the edit is undone

Scenario: User triggers redo with keyboard
  Given a compiler .scene has a redoable edit
  When the user presses the platform redo shortcut
  Then the edit is redone
```

TDD 入口：

- `tests/editor-workbench-ui.test.ts`

### BDD-UNDO-009 输入框内不触发全局撤销

Feature: Text input keeps native editing behavior

```gherkin
Scenario: User presses undo while editing an input field
  Given a compiler .scene has an undoable edit
  And an Inspector input field is focused
  When the user presses the platform undo shortcut
  Then Pixifact does not run global Scene undo
```

TDD 入口：

- `tests/editor-workbench-ui.test.ts`

## 3. TDD 实施顺序

### Phase 1: Command 类型和纯函数行为

新增：

```txt
packages/pixifact/src/compiler/commands/
tests/compiler-scene-commands.test.ts
```

先写失败测试：

1. `setSceneName` 返回 inverse 并可恢复。
2. `setSceneProp` 返回 inverse 并可恢复。
3. `setNodeProp` 返回 inverse 并可恢复。
4. `setNodeEvent` 返回 inverse 并可恢复。
5. `renameSlotOutlet` 返回 inverse 并可恢复。
6. `insertNode` 的 inverse 是 `deleteNode`。
7. `deleteNode` 的 inverse 是带原 parent/index 的 `insertNode`。
8. `moveNode` 的 inverse 是回到原 parent/index。
9. `batch` 中途失败会回滚已执行命令。

Green 目标：

- 实现 `CompilerSceneCommand`。
- 实现 `applyCompilerSceneCommand(template, command)`。
- 所有命令只修改传入 template，不依赖 editor state。

### Phase 2: Command Stack

继续在 `tests/compiler-scene-commands.test.ts` 写失败测试：

1. `execute` 成功后 `canUndo=true`。
2. `undo` 恢复内容，并让 `canRedo=true`。
3. `redo` 恢复修改。
4. failed command 不进入 undoStack。
5. execute 新命令清空 redoStack。
6. `markSaved` 后 dirty=false。
7. 修改后 dirty=true。
8. undo 回保存点 dirty=false。
9. redo 离开保存点 dirty=true。
10. 同 `mergeKey` 连续命令合并成一步 undo。

Green 目标：

- 实现 `CompilerSceneCommandStack`。
- 使用 revision / savedRevision 计算 dirty。
- 支持 `mergeKey`。

### Phase 3: Controller 接入

测试文件：

```txt
tests/compiler-scene-document-controller.test.ts
```

如果现有测试边界更合适，也可以并入 `tests/project-file-tree.test.ts`，但建议新建 controller 测试，避免文件树测试继续膨胀。

先写失败测试：

1. `updateCompilerSceneTemplate` 进入 command stack。
2. `updateCompilerSceneNode` 进入 command stack。
3. `addCompilerSceneNode` 进入 command stack。
4. `deleteCompilerSceneNode` 进入 command stack。
5. `moveCompilerSceneNode` 进入 command stack。
6. `undoCompilerSceneCommand` 恢复 controller document。
7. `redoCompilerSceneCommand` 恢复 controller document。
8. `selectCompilerSceneNode` 不进入 history。
9. `refreshCompilerSceneBindingSnapshot` 不进入 history。
10. `loadCompilerSceneDocument` 清空 history。

Green 目标：

- `compilerSceneDocumentController` 只通过 command stack 修改 `.scene` 可编辑内容。
- 保留现有外部 API，减少面板改动。
- `dirty` 来自 command stack，而不是手动布尔值。

### Phase 4: Editor UI 按钮

测试文件：

```txt
tests/editor-workbench-ui.test.ts
```

先写失败测试：

1. 打开 compiler scene 时顶部栏有撤销 / 重做按钮。
2. 没有 undo 历史时撤销 disabled。
3. 修改 Inspector 字段后撤销 enabled。
4. 点击撤销后字段和 viewport 恢复。
5. 点击撤销后重做 enabled。
6. 点击重做后字段和 viewport 恢复到修改值。

Green 目标：

- Topbar 增加 icon-only undo / redo。
- 按钮有 `aria-label` 和 `title`。
- disabled 状态由 command stack 决定。

### Phase 5: 快捷键

继续在 `tests/editor-workbench-ui.test.ts` 写失败测试：

1. `Meta+Z` 或 `Ctrl+Z` 调用 undo。
2. `Meta+Shift+Z` 或 `Ctrl+Shift+Z` 调用 redo。
3. `Ctrl+Y` 调用 redo。
4. `input` 聚焦时不调用全局 undo。
5. `textarea` / `select` / `contenteditable` 聚焦时不调用全局 undo。

Green 目标：

- 在 editor 顶层注册 keydown handler。
- 明确跳过可编辑目标。
- 快捷键只作用于当前打开的 compiler scene。

### Phase 6: Hierarchy 行为

继续在 `tests/editor-workbench-ui.test.ts` 写失败测试：

1. 拖动节点调整顺序后可以 undo。
2. 拖动节点调整父级后可以 undo。
3. 空白处 drop 到根层级后可以 undo。
4. 删除节点后可以 undo。
5. 删除节点 undo 后 selection 合理恢复。

Green 目标：

- Hierarchy move / insert / delete 都走 command。
- Undo 后 hierarchy、inspector、viewport 同步更新。

## 4. 命令设计约束

- 底层 command 不使用 UI drop 语义。
- UI 的 before / inside / after 必须在进入 command 前转换成 parent/index。
- command 不读取 Zustand。
- command 不调用 React。
- command 不访问 host bridge。
- command 不写文件。
- command 必须生成 inverse。
- batch command 必须具备失败回滚。

## 5. Dirty 规则

必须用 revision 模型：

```txt
dirty = currentRevision !== savedRevision
```

场景：

- 打开文件：clean。
- 修改：dirty。
- 保存成功：clean。
- undo 回保存点：clean。
- redo 离开保存点：dirty。
- 打开另一个文件：清空 history，clean。
- 外部文件重载：清空 history，clean。

## 6. Selection 规则

命令结果可以返回建议 selection。

默认规则：

- insert 后选择新节点。
- delete 后选择父级，父级不存在则选择 scene root。
- move 后选择移动后的节点。
- set id / rename slot 后选择新 locator。
- undo / redo 后如果 selection 不存在，fallback 到 scene root。

## 7. 验证命令

每个 phase 的最小验证：

```bash
bunx --no-install vitest run tests/compiler-scene-commands.test.ts
```

Controller 接入后：

```bash
bunx --no-install vitest run tests/compiler-scene-commands.test.ts tests/compiler-scene-document-controller.test.ts
```

Editor UI 接入后：

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts
```

最终验证：

```bash
bun run test
bun run editor:frontend:build
```

## 8. Definition of Done

- 所有 `.scene` editor mutation 都经过 compiler command stack。
- 撤销 / 重做按钮状态正确。
- 快捷键可用。
- 输入框聚焦时不会触发全局撤销。
- dirty 能准确回到保存点。
- add / delete / move / prop edit 都可 undo / redo。
- batch 失败不留下半成功状态。
- 新修改会清空 redo。
- 测试覆盖 command、controller、editor UI 三层。
