# Compiler Scene Undo / Redo TDD

本文档定义 compiler `.scene` 撤销 / 重做能力的测试驱动实施计划。需求说明见 [COMPILER_SCENE_UNDO_REDO_REQUIREMENTS.md](./COMPILER_SCENE_UNDO_REDO_REQUIREMENTS.md)。

行为规格见 [COMPILER_SCENE_UNDO_REDO_BDD.md](./COMPILER_SCENE_UNDO_REDO_BDD.md)。全局 TDD 规范见 [TDD.md](./TDD.md)。

## 1. 测试边界

新增能力分三层测试：

- Command layer：纯 `.scene` command 行为，不依赖 editor。
- Controller layer：`compilerSceneDocumentController` 接入 command stack。
- Editor UI layer：按钮、快捷键、面板同步。

建议新增测试文件：

```txt
tests/compiler-scene-commands.test.ts
tests/compiler-scene-document-controller.test.ts
```

继续扩展：

```txt
tests/editor-workbench-ui.test.ts
```

## 2. Phase 1: Command 类型和纯函数行为

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

最小验证：

```bash
bunx --no-install vitest run tests/compiler-scene-commands.test.ts
```

## 3. Phase 2: Command Stack

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

最小验证：

```bash
bunx --no-install vitest run tests/compiler-scene-commands.test.ts
```

## 4. Phase 3: Controller 接入

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

最小验证：

```bash
bunx --no-install vitest run tests/compiler-scene-commands.test.ts tests/compiler-scene-document-controller.test.ts
```

## 5. Phase 4: Editor UI 按钮

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

最小验证：

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts
```

## 6. Phase 5: 快捷键

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

最小验证：

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts
```

## 7. Phase 6: Hierarchy 行为

继续在 `tests/editor-workbench-ui.test.ts` 写失败测试：

1. 拖动节点调整顺序后可以 undo。
2. 拖动节点调整父级后可以 undo。
3. 空白处 drop 到根层级后可以 undo。
4. 删除节点后可以 undo。
5. 删除节点 undo 后 selection 合理恢复。

Green 目标：

- Hierarchy move / insert / delete 都走 command。
- Undo 后 hierarchy、inspector、viewport 同步更新。

最小验证：

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts
```

## 8. 命令设计约束

- 底层 command 不使用 UI drop 语义。
- UI 的 before / inside / after 必须在进入 command 前转换成 parent/index。
- command 不读取 Zustand。
- command 不调用 React。
- command 不访问 host bridge。
- command 不写文件。
- command 必须生成 inverse。
- batch command 必须具备失败回滚。

## 9. Dirty 规则

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

## 10. Selection 规则

命令结果可以返回建议 selection。

默认规则：

- insert 后选择新节点。
- delete 后选择父级，父级不存在则选择 scene root。
- move 后选择移动后的节点。
- set id / rename slot 后选择新 locator。
- undo / redo 后如果 selection 不存在，fallback 到 scene root。

## 11. 最终验证

```bash
bun run test
bun run editor:frontend:build
```

## 12. Definition of Done

- 所有 `.scene` editor mutation 都经过 compiler command stack。
- 撤销 / 重做按钮状态正确。
- 快捷键可用。
- 输入框聚焦时不会触发全局撤销。
- dirty 能准确回到保存点。
- add / delete / move / prop edit 都可 undo / redo。
- batch 失败不留下半成功状态。
- 新修改会清空 redo。
- 测试覆盖 command、controller、editor UI 三层。
