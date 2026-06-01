# Compiler Scene Undo / Redo Requirements

本文档描述 compiler `.scene` 撤销 / 重做需求本身。行为场景见 [COMPILER_SCENE_UNDO_REDO_BDD.md](./COMPILER_SCENE_UNDO_REDO_BDD.md)，测试驱动实施计划见 [COMPILER_SCENE_UNDO_REDO_TDD.md](./COMPILER_SCENE_UNDO_REDO_TDD.md)。

## 1. 背景

Pixifact Editor 当前主编辑流程已经转向 compiler `.scene`。

legacy `SceneDocument` 内部有 `SceneCommand` 和 undo / redo，但它服务 legacy `SceneSpec`，不服务当前 editor 的 compiler `.scene` source of truth。

当前 compiler scene document 的修改主要集中在 `compilerSceneDocumentController`，现状是直接 clone / mutate template，然后标记 dirty。这导致：

- 用户无法撤销 Inspector 修改。
- 用户无法撤销 Hierarchy 添加、删除、移动。
- 顶部栏没有撤销 / 重做入口。
- 快捷键没有接入。
- dirty 只能用 boolean 表示，不能准确判断是否撤回保存点。

本需求要补齐 compiler `.scene` authoring 的正式撤销 / 重做基础能力。

## 2. 目标

实现一套 compiler `.scene` 专用 command system，使 editor 内所有 `.scene` 内容修改都可撤销 / 重做。

目标能力：

- Scene 属性编辑可撤销 / 重做。
- 节点 id、props、events、slot name 编辑可撤销 / 重做。
- 节点新增可撤销 / 重做。
- 节点删除可撤销 / 重做。
- 节点移动可撤销 / 重做。
- 拖拽添加 Scene instance、节点模板、scene tool 可撤销 / 重做。
- 顶部栏提供撤销 / 重做按钮。
- 支持平台常见快捷键。
- dirty 状态能准确反映是否等于保存点。

## 3. 非目标

本需求不包含：

- 文件系统级撤销 / 重做。
- 新建 Scene 文件撤销。
- 新建文件夹撤销。
- 打开文件撤销。
- 保存操作撤销。
- Dockview 布局撤销。
- 项目面板选择状态撤销。
- 外部文件变更合并。
- Editor live bridge mutation。
- 复用 legacy `SceneDocument`。

## 4. 用户故事

### US-UNDO-001 属性编辑撤销

作为 Editor 用户，我希望修改 Inspector 里的 Scene 或节点属性后，可以撤销和重做，这样我能安全试错。

### US-UNDO-002 层级编辑撤销

作为 Editor 用户，我希望新增、删除、移动层级节点后，可以撤销和重做，这样我能快速恢复误操作。

### US-UNDO-003 快捷键撤销

作为 Editor 用户，我希望使用系统常见快捷键撤销 / 重做，而不是只能点击按钮。

### US-UNDO-004 保存状态准确

作为 Editor 用户，我希望撤销回保存内容后，Editor 显示为已保存，而不是仍显示未保存。

## 5. 功能需求

### FR-UNDO-001 Command System

Pixifact 必须为 compiler `.scene` 提供独立 command system。

要求：

- command 层不依赖 React。
- command 层不依赖 Zustand。
- command 层不访问 host bridge。
- command 层不写文件。
- command 必须可生成 inverse。
- command apply 失败时不得修改 template。

### FR-UNDO-002 Command Stack

Pixifact 必须提供 compiler scene command stack。

要求：

- 成功 execute 后可 undo。
- undo 后可 redo。
- 新 execute 后清空 redo。
- failed command 不进入 history。
- 支持 batch command。
- batch 中途失败必须回滚已执行 child command。
- 支持 mergeKey 合并连续属性编辑。

### FR-UNDO-003 Dirty Revision

dirty 必须基于 revision，而不是只用 boolean 手动设置。

要求：

- 打开文件时 clean。
- 修改后 dirty。
- 保存成功后 clean。
- undo 回保存点后 clean。
- redo 离开保存点后 dirty。
- 打开新文件或外部重载后清空 history 并 clean。

### FR-UNDO-004 Controller Integration

`compilerSceneDocumentController` 的内容修改必须走 command stack。

必须接入：

- `updateCompilerSceneTemplate`
- `updateCompilerSceneNode`
- `addCompilerSceneInstanceNode`
- `addCompilerSceneNode`
- `deleteCompilerSceneNode`
- `moveCompilerSceneNode`

不得进入 history：

- `selectCompilerSceneNode`
- `loadCompilerSceneDocument`
- `closeCompilerSceneDocument`
- `refreshCompilerSceneDescriptor`
- `refreshCompilerSceneBindingSnapshot`

### FR-UNDO-005 UI Entry

Editor 顶部栏必须提供撤销 / 重做按钮。

要求：

- 使用 icon-only button。
- 有 `aria-label`。
- 有 `title`。
- 没有 undo 历史时撤销 disabled。
- 没有 redo 历史时重做 disabled。
- 没打开 compiler scene 时按钮 disabled 或隐藏。

### FR-UNDO-006 Keyboard Shortcuts

Editor 必须支持常见撤销 / 重做快捷键。

要求：

- macOS undo：`Meta+Z`
- macOS redo：`Meta+Shift+Z`
- Windows / Linux undo：`Ctrl+Z`
- Windows / Linux redo：`Ctrl+Shift+Z`
- Windows / Linux redo：`Ctrl+Y`

当以下元素聚焦时，不触发全局撤销 / 重做：

- `input`
- `textarea`
- `select`
- `contenteditable`

## 6. 数据边界

Undo / redo 只管理 `.scene` 可编辑内容：

- Scene name
- Scene props
- node tree
- node id
- node props
- node events
- slot outlet name
- scene instance slots

Undo / redo 不管理 derived context：

- descriptor
- sceneInterfaces
- template.interface

## 7. 交互边界

### 顶部栏

撤销 / 重做是当前 Scene 的全局编辑动作，应放在顶部栏，不放在 Hierarchy 或 Inspector 内。

### Hierarchy

Hierarchy 的 before / inside / after drop 语义只属于 UI 层。进入 command 前必须转换为稳定的 parent/index。

### Inspector

Inspector 的字段编辑应使用 mergeKey 合并连续变更，避免每个输入字符都成为独立 undo 步骤。

## 8. 验收标准

本需求完成时必须满足：

- command 层有自动化测试。
- controller 接入有自动化测试。
- editor UI 有自动化测试。
- Inspector 属性修改可 undo / redo。
- Hierarchy add / delete / move 可 undo / redo。
- dirty 能准确回到保存点。
- undo / redo 按钮状态正确。
- 快捷键生效。
- 输入控件聚焦时快捷键不触发全局撤销。
- 全量测试通过。
- editor frontend build 通过。
