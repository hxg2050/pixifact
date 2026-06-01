# Compiler Scene Undo / Redo BDD

本文档定义 compiler `.scene` 撤销 / 重做能力的用户行为和验收场景。需求说明见 [COMPILER_SCENE_UNDO_REDO_REQUIREMENTS.md](./COMPILER_SCENE_UNDO_REDO_REQUIREMENTS.md)。

测试驱动实施计划见 [COMPILER_SCENE_UNDO_REDO_TDD.md](./COMPILER_SCENE_UNDO_REDO_TDD.md)。全局 BDD 规范见 [BDD.md](./BDD.md)。

## 1. 范围

本行为规格只覆盖 Pixifact Editor 内部的 compiler `.scene` authoring。

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

## 2. 行为场景

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

### BDD-UNDO-009 输入框内不触发全局撤销

Feature: Text input keeps native editing behavior

```gherkin
Scenario: User presses undo while editing an input field
  Given a compiler .scene has an undoable edit
  And an Inspector input field is focused
  When the user presses the platform undo shortcut
  Then Pixifact does not run global Scene undo
```

## 3. 验收标准

- 所有 `.scene` editor mutation 都可以撤销 / 重做。
- 撤销 / 重做后 Inspector、Hierarchy、Viewport 同步更新。
- 保存点 dirty 状态准确。
- 新修改会清空 redo。
- 快捷键可用。
- 输入控件聚焦时不触发全局撤销。
