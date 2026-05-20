# Pixifact BDD

本文档定义 Pixifact 当前阶段的行为规格和验收场景。BDD 负责描述产品行为、系统边界和失败状态，不要求引入 Cucumber 或新的依赖。

测试落地方式、文件归属和验证命令见 [TDD.md](./TDD.md)。统一入口见 [TESTING.md](./TESTING.md)。

## 1. BDD 原则

- 先描述用户或 Agent 行为，再决定实现方式。
- 场景必须绑定 Pixifact 真实边界：`SceneSpec`、`SceneDocument`、`SceneCommand`、CLI、Gateway、Runtime。
- 行为验收必须包含成功路径和关键失败状态。
- 不为旧 API、旧路径、旧协议或旧数据格式写兼容场景。
- 行为描述使用稳定 locator：Scene 节点用 `key` / `id`，组件用 `id`，文件用 project-relative path。
- 每个场景都应能映射到一个或多个 TDD 测试入口。

## 2. 核心领域层

核心领域层描述不依赖具体 UI 的产品规则，测试目标是 `packages/pixifact`。

### BDD-SCENE-001 创建合法 Scene 资产

```gherkin
Feature: Scene asset
  Scenario: 创建一个空白 Scene
    Given 用户在项目文件树中选择一个目录
    When 用户创建名为 "inventory panel" 的 Scene
    Then 系统写入 "InventoryPanel.scene"
    And scene.version 等于 1
    And scene.type 等于 "scene"
    And scene.name 等于 "InventoryPanel"
    And scene.root.kind 等于 "container"
    And scene.root.key 等于 "inventoryPanelRoot"
```

TDD 入口：`tests/project-file-tree.test.ts` 的 scene naming / create scene 测试。

### BDD-SCENE-002 Scene 只暴露公开节点类型

```gherkin
Feature: Scene node model
  Scenario: Agent 创建节点
    Given 当前 Scene root 是 container
    When Agent 通过 createNode 创建 text / image / input / shape / container
    Then 命令通过校验
    And 显示数据保存在节点字段上
    And 不暴露 ui.TextGraphic / ui.ImageGraphic / ui.RoundedRectGraphic 作为 authoring 节点
```

TDD 入口：`tests/editor.test.ts` 的 command validation、template 和 instantiate 测试。

### BDD-SCENE-003 非 container 节点不能包含 children

```gherkin
Feature: Container-only hierarchy
  Scenario: 在 text 节点下创建子节点
    Given 当前 Scene 有一个 text 节点 "submitButtonLabel"
    When createNode 的 parent 指向 "submitButtonLabel"
    Then 命令失败
    And 错误说明只有 container 节点可以拥有 children
    And 原 Scene 不改变
```

TDD 入口：`tests/editor.test.ts` 的 non-container child rejection。

## 3. Command / Document 层

Command / Document 层是 editor、CLI 和 Agent 的共同修改入口。

### BDD-CMD-001 Dry Run 必须产生 diff 且不修改源 Scene

```gherkin
Feature: Command dry-run
  Scenario: Agent 预演修改按钮文案
    Given 当前 label 文案是 "Submit"
    When Agent dry-run setNodeData 将 label 改为 "Continue"
    Then dry-run 返回 ok
    And diff target 是 "submitButtonLabel.text.value"
    And diff before 是 "Submit"
    And diff after 是 "Continue"
    And 源 Scene 文案仍是 "Submit"
```

TDD 入口：`tests/editor.test.ts` 的 `dryRunCommands` / `dryRunProposal`；CLI 文件模式对应 `tests/pixifact-cli.test.ts`。

### BDD-CMD-002 Apply 必须经过 SceneDocument 并支持 undo / redo

```gherkin
Feature: SceneDocument command application
  Scenario: 手动修改节点字段
    Given SceneDocument 已加载按钮 Scene
    When 用户通过 setNodeData 修改 label 文案
    Then SceneDocument dirty 为 true
    And override journal 记录 source "manual"
    And undo 恢复旧值
    And redo 恢复新值
```

TDD 入口：`tests/editor.test.ts` 的 `SceneDocument` apply / undo / redo。

### BDD-CMD-003 锁定属性拒绝 AI 修改

```gherkin
Feature: Property locks
  Scenario: AI 修改 designer lock 的字体大小
    Given submitButtonLabel.text.fontSize 被锁定
    When AI proposal 尝试 setNodeData fontSize
    Then dry-run 失败
    And 错误说明目标被锁定
    And Scene 不改变
```

TDD 入口：`tests/editor.test.ts` 的 lock / dry-run proposal 测试。

### BDD-CMD-004 Batch 命令应以一个行为单元验证

```gherkin
Feature: Batch command
  Scenario: 生成背包面板
    Given 当前 Scene 是一个按钮 Scene
    When apply batch createInventoryPanelCommands with columns 4 and rows 3
    Then Scene 中出现 inventoryPanel
    And inventoryPanel 下有 12 个 inventory-slot role 节点
    And instantiate 后 runtime nodes 和 components 可按 key / id 找到
```

TDD 入口：`tests/editor.test.ts` 的 inventory template command 测试。

## 4. Runtime 层

Runtime 层保证 Scene 能实例化为 Pixi-backed tree，但 PixiJS 不成为 authoring 心智。

### BDD-RUNTIME-001 Scene 实例化解析节点、组件和 actions

```gherkin
Feature: Scene instantiation
  Scenario: 实例化 Button Scene
    Given Button Scene 的 Button component 引用 onClick "submitLogin"
    When instantiate(scene, actions.submitLogin)
    Then runtime root 是 Group
    And graphic / text component 可通过 id 查找
    And pointertap 触发 submitLogin
```

TDD 入口：`tests/unity-ui.test.ts` 和 `tests/editor.test.ts` 的 instantiate vertical slice。

### BDD-RUNTIME-002 组件生命周期必须可清理

```gherkin
Feature: Component lifecycle
  Scenario: 销毁含组件的 GameObject
    Given 一个 mounted GameObject 含有需要 update 的 Component
    When GameObject 被 destroy
    Then onDestroy 被调用
    And ticker listener 被释放
    And 后续 ticker update 不再调用该对象
```

TDD 入口：`tests/core.test.ts` 的 component lifecycle 和 ticker cleanup。

### BDD-RUNTIME-003 DOM-backed 节点必须跟随 viewport 并释放 DOM

```gherkin
Feature: DOM-backed input
  Scenario: 输入框跟随 canvas 偏移
    Given Input 节点绑定 canvas
    When canvas rect 或父节点 transform 变化
    Then DOM element transform 与 runtime global transform 一致
    When Input 被 destroy
    Then DOM element 从 document.body 移除
    And window / DOM event handler 被释放
```

TDD 入口：`tests/ui.test.ts`。

## 5. Editor 产品层

Editor 产品层以桌面工作流为准，不维护独立浏览器版入口。

### BDD-EDITOR-001 打开、编辑、保存 `.scene`

```gherkin
Feature: Desktop scene file editing
  Scenario: 用户打开并保存 Scene 文件
    Given 项目文件树中存在 "scenes/Button.scene"
    When 用户打开该文件
    And 在 Inspector 修改 label 文案
    And 保存当前 Scene
    Then 写回原始 ".scene" 文件
    And 保存后的 JSON 包含新文案
    And SceneDocument dirty 变为 false
```

TDD 入口：service 级先覆盖 `tests/project-file-tree.test.ts`；桌面 E2E 后续走 Tauri host 自动化或手动验证，不新增浏览器版 Playwright 主流程。

### BDD-EDITOR-002 Zustand 只保存 UI 偏好

```gherkin
Feature: Editor UI store
  Scenario: 用户调整 UI 偏好和 prompt
    Given editor store 已初始化
    When 用户修改 language 和 prompt
    Then localStorage 可保存 language
    And 不保存 prompt
    And 不保存 gateway secret / Authorization
    And 不保存 SceneSpec / SceneDocument
```

TDD 入口：`tests/editor-store.test.ts`。

### BDD-EDITOR-003 Inspector 修改必须转换为 SceneCommand

```gherkin
Feature: Inspector editing
  Scenario: 修改 text 节点 value
    Given 用户选择 text 节点
    When Inspector 提交 value 字段
    Then editor 调用 SceneDocument apply
    And command op 是 setNodeData
    And Viewport preview 从 SceneDocument 重建
```

TDD 入口：优先测 `SceneDocument` + inspector model；需要 React 行为时再增加 panel-level test。

### BDD-EDITOR-004 Component 文件拖拽添加行为组件

```gherkin
Feature: Component drag-and-drop
  Scenario: 用户把 ButtonBinding.ts 拖到 Inspector
    Given 项目文件树识别该文件 detail 为 "ui.Button"
    And 当前选择一个 Scene 节点
    When 用户将文件拖入 Add Component 区域
    Then editor 创建 ComponentSpec
    And 通过 addComponent command 写入 SceneDocument
    And 不直接把文件内容写入 Scene
```

TDD 入口：`tests/project-file-tree.test.ts` 的 component path classification；新增拖拽行为时用 service / panel test。

## 6. CLI / Agent 层

CLI 是外部 Agent 的主入口。没有 live editor 时操作项目文件；live 模式下转发给 editor bridge。

### BDD-CLI-001 CLI 输出项目摘要

```gherkin
Feature: Pixifact CLI summary
  Scenario: Agent 请求项目摘要
    Given projectRoot 下存在 scenes/Button.scene
    When Agent 执行 pixifact summary
    Then CLI 返回 JSON
    And scenes 包含 "scenes/Button.scene"
```

TDD 入口：`tests/pixifact-cli.test.ts`。

### BDD-CLI-002 commands dry-run 不写文件

```gherkin
Feature: Pixifact CLI dry run
  Scenario: Agent 预演修改文件模式 Scene
    Given projectRoot 下有 "button.scene"
    When Agent 执行 pixifact commands dry-run
    Then CLI 返回 diffs
    And 磁盘上的 button.scene 内容不变
```

TDD 入口：`tests/pixifact-cli.test.ts`。

### BDD-CLI-003 commands apply 写回 `.scene`

```gherkin
Feature: Pixifact CLI apply
  Scenario: Agent 应用合法命令
    Given projectRoot 下有 "button.scene"
    When Agent 执行 pixifact commands apply
    Then CLI 使用 SceneDocument 应用命令
    And 保存后的 ".scene" 包含新值
```

TDD 入口：`tests/pixifact-cli.test.ts`。

### BDD-CLI-004 CLI 拒绝 projectRoot 外路径

```gherkin
Feature: Pixifact CLI path guard
  Scenario: Agent 读取 "../outside.scene"
    Given projectRoot 指向当前项目
    When Agent 执行 pixifact scene get with --scene "../outside.scene"
    Then CLI 返回非 0 exit code
    And stdout 或 stderr 包含错误 JSON
    And 错误说明文件必须在 projectRoot 内
```

TDD 入口：`tests/pixifact-cli.test.ts`。

### BDD-CLI-005 Live editor 路由

```gherkin
Feature: Live editor bridge
  Scenario: Live editor 已连接
    Given liveBridge.connected 为 true
    When Agent 执行 pixifact live scene get
    Then CLI 不读取磁盘文件
    And 将 request 路由到 liveBridge.callTool
    And 参数不包含 projectRoot 或 scenePath
```

TDD 入口：`tests/pixifact-cli.test.ts`。

### BDD-CLI-006 template add 展开 Scene 模板

```gherkin
Feature: Pixifact CLI template add
  Scenario: Agent 使用模板添加登录表单
    Given projectRoot 下有 "login.scene"
    When Agent 执行 pixifact template add dry-run with kind "loginForm"
    Then CLI 返回展开后的 SceneCommand[]
    And 磁盘上的 login.scene 内容不变

  Scenario: Agent 应用按钮模板
    Given projectRoot 下有 "button.scene"
    When Agent 执行 pixifact template add apply with kind "button"
    Then CLI 先 dry-run 再通过 SceneDocument.apply 写回
    And 保存后的 ".scene" 包含 Button container template
```

TDD 入口：`tests/pixifact-cli.test.ts`。

## 7. AI Gateway 层

Gateway 只返回结构化 proposal，不直接修改项目。

### BDD-AI-001 Gateway 返回合法 proposal response

```gherkin
Feature: AI gateway
  Scenario: Remote provider 请求 proposal
    Given request protocol 是 pixifact.aiProposal.v1
    When gateway 调用模型生成 proposal
    Then response status 是 200
    And body.proposal.commands 是数组
    And gateway 不修改 SceneDocument 或项目文件
```

TDD 入口：`tests/ai-gateway-adapter.test.ts`。

### BDD-AI-002 Gateway 拒绝无效请求和鉴权失败

```gherkin
Feature: AI gateway validation
  Scenario: 鉴权 token 不匹配
    Given gatewayToken 是 "local-test"
    When request authorization 是 "Bearer wrong"
    Then response status 是 401
    And error.code 是 "unauthorized"

  Scenario: protocol 无效
    When request.protocol 不是 "pixifact.aiProposal.v1"
    Then response status 是 400
    And error.code 是 "invalid_request"
```

TDD 入口：`tests/ai-gateway-adapter.test.ts`。

### BDD-AI-003 模型配置不得泄露 secret 到 prompt

```gherkin
Feature: Model adapter secret handling
  Scenario: UI 传入 per-request model config
    Given model token 是 "ui-secret"
    When adapter 构造 Responses API request body
    Then request header 带有 token
    And prompt / input 不包含 token
    And prompt / input 不包含 endpoint URL
```

TDD 入口：`tests/ai-model-adapter.test.ts`。

### BDD-AI-004 模型误报缺少 command spec 时重试

```gherkin
Feature: Model adapter repair prompt
  Scenario: 上游模型第一次声称缺少 SceneCommand 规范
    Given 第一次模型 response explanation 包含缺少命令规范
    When adapter 检测到该错误
    Then adapter 发起第二次请求
    And 第二次 prompt 明确指出 command specs 已提供
    And 返回第二次 proposal
```

TDD 入口：`tests/ai-model-adapter.test.ts`。

## 8. 当前测试缺口和优先级

### P0：`.scene` 创建、打开、保存、CLI 修改、editor 预览的端到端覆盖

目标场景：

```gherkin
Feature: Scene edit loop
  Scenario: 用户从文件树打开 Scene，Agent 通过 CLI 修改，editor preview 更新并保存
    Given desktop editor 打开一个项目
    And 文件树中存在 scenes/Button.scene
    When 用户打开 Button.scene
    And Agent 通过 pixifact commands dry-run 修改 label
    And 用户 review diff 并 apply
    Then SceneDocument 更新
    And Viewport preview 更新
    And 保存后磁盘 ".scene" 包含新 label
```

落地方式：先补 service / CLI / document 集成测试；桌面主流程后续通过 Tauri host 自动化或手动验证，不恢复浏览器版 editor E2E。

### P0：Live CLI bridge 和 SceneDocument 的真实联动

目标场景：

```gherkin
Feature: Live editor CLI bridge
  Scenario: CLI 调用 connected editor 的当前 Scene
    Given editor 当前打开 Menu.scene
    And live bridge connected
    When Agent 执行 pixifact live commands apply
    Then 命令应用到当前 SceneDocument
    And 不写未打开的磁盘文件
```

落地方式：扩展 live bridge server / editor automation 的测试替身，覆盖 connected path 的参数和副作用。

### 已覆盖：Inspector 节点类型专属字段

目标场景：

```gherkin
Feature: Node-specific Inspector
  Scenario: 用户选择 text 节点
    Given 当前选择 text node
    When Inspector 渲染字段
    Then 展示 text.value、text.color、text.fontSize
    And 不展示 image.src 或 shape.radius
```

落地方式：已由 `tests/editor.test.ts` 的 `builds node-specific inspector display fields` 覆盖 `text/image/input/shape/container` 的字段过滤。

### P1：Scene 模板库扩充

目标场景：

```gherkin
Feature: Scene templates
  Scenario: 用户添加 ScrollView 模板
    Given 当前选择 container
    When 用户从模板库添加 ScrollView
    Then Scene 新增 container template
    And ScrollRect component 引用 content / viewport
    And instantiate 后 scroll 行为可工作
```

落地方式：已由 `tests/editor.test.ts` 覆盖 Button / ProgressBar / ScrollView 的 container template 结构和 editor template library 入口；由 `tests/ui.test.ts` 覆盖 `ScrollRect` 的滚动行为与事件清理。

### P1：AI proposal repair loop 面向 CLI / gateway 的一致性

目标场景：

```gherkin
Feature: Agent repair loop
  Scenario: AI 第一次返回 invalid command
    Given proposal command 指向 missing node
    When dry-run 失败
    Then repair prompt 包含 Pixifact 校验错误
    And 第二次 proposal 通过 dry-run 后才 apply
```

落地方式：当前 `executeAiPrompt` 已有基础测试；后续要补 CLI/gateway path 的一致性。

### P2：桌面 host 文件能力

目标场景：

```gherkin
Feature: Desktop host file actions
  Scenario: 用户在 Explorer 打开代码文件
    Given 文件树中存在 scripts/logic.ts
    When 用户触发 open in code
    Then Tauri host 收到 project-relative path
    And editor 不读取或缓存代码文件内容作为项目数据
```

落地方式：hostBridge service mock + Tauri command test。
