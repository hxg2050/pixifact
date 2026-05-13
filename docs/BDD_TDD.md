# Pixifact BDD / TDD Strategy

本文档是 Pixifact 当前阶段的项目级 BDD / TDD 规范。它以现有架构为边界：`SceneSpec` 是资产格式，`SceneDocument` 是 editor 和 Agent 修改 Scene 的唯一 source of truth，AI / Agent 只能生成 `SceneCommand` / proposal，真实修改必须经过 dry-run、diff review 和 apply。

这里的 BDD 不要求引入 Cucumber 或新的依赖。现阶段 BDD 用来定义行为验收场景，TDD 继续使用 Vitest、TypeScript 类型检查和构建命令落地。

## 1. 测试原则

- 先写行为，再写实现：新需求先补一个最小失败测试或一个可执行验收场景。
- 测试公共语义层：优先覆盖 `pixifact` public exports、`SceneDocument`、`SceneCommand`、editor services、MCP request handler 和 gateway core。
- 不为旧 API 写兼容测试：项目处于开发阶段，不新增 legacy path、alias、fallback 或 deprecation shim。
- 不测试静默默认值：除非需求明确，测试应让错误自然暴露，并断言真实失败原因。
- 不让 UI state 成为项目数据源：测试必须确认项目数据来自 `SceneDocument` 或 `.scene` 文件，而不是 Zustand 副本。
- 行为测试用稳定 locator：Scene 节点用 `key` / `id`，组件用 `id`，文件用 project-relative path。
- 先最小验证，再扩大范围：每次改动优先运行最小相关测试，跨边界改动再运行完整 `bun run test` 和构建。

## 2. 现有测试地图

| 文件 | 责任边界 | 当前覆盖重点 |
| --- | --- | --- |
| `tests/core.test.ts` | runtime foundation | `GameObject`、transform、children、layout、lifecycle、ticker |
| `tests/ui.test.ts` | DOM-backed runtime nodes | `Input`、`Textarea`、`ScrollRect`、DOM cleanup、viewport transform |
| `tests/unity-ui.test.ts` | runtime component metadata + template slice | component schema、Button runtime composition、Scene DSL instantiate |
| `tests/editor.test.ts` | authoring semantic layer | `SceneDocument`、commands、undo/redo、dry-run、diff、locks、memory、logic、AI proposal |
| `tests/editor-store.test.ts` | editor UI store | Zustand 只持久化轻量偏好，不保存 project data / secrets |
| `tests/project-file-tree.test.ts` | desktop project file service | `.scene` 创建保存、文件树分类、重命名、删除、scene instance key isolation |
| `tests/pixifact-mcp-server.test.ts` | MCP server | tools list、get/dry-run/apply、path guard、live bridge routing |
| `tests/ai-gateway-adapter.test.ts` | gateway protocol shell | proposal response、auth、invalid request、invalid model proposal |
| `tests/ai-gateway-config.test.ts` | gateway config | local defaults、env token、model adapter env mapping |
| `tests/ai-model-adapter.test.ts` | upstream model adapter | Chat Completions / Responses body、URL normalize、secret handling、retry、timeout |
| `tests/mock-ai-server.test.ts` | mock remote AI | mock proposal protocol、invalid payload |

新增测试应先落到这些既有边界；只有当行为无法归入现有边界时，才新增测试文件。

## 3. BDD 分层

### 3.1 核心领域层

核心领域层描述不依赖具体 UI 的产品规则，测试目标是 `packages/pixifact`。

#### BDD-SCENE-001 创建合法 Scene 资产

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

#### BDD-SCENE-002 Scene 只暴露公开节点类型

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

#### BDD-SCENE-003 非 container 节点不能包含 children

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

### 3.2 Command / Document 层

Command / Document 层是 editor、MCP 和 Agent 的共同修改入口。

#### BDD-CMD-001 Dry Run 必须产生 diff 且不修改源 Scene

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

TDD 入口：`tests/editor.test.ts` 的 `dryRunCommands` / `dryRunProposal`；MCP 文件模式对应 `tests/pixifact-mcp-server.test.ts`。

#### BDD-CMD-002 Apply 必须经过 SceneDocument 并支持 undo / redo

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

#### BDD-CMD-003 锁定属性拒绝 AI 修改

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

#### BDD-CMD-004 Batch 命令应以一个行为单元验证

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

### 3.3 Runtime 层

Runtime 层保证 Scene 能实例化为 Pixi-backed tree，但 PixiJS 不成为 authoring 心智。

#### BDD-RUNTIME-001 Scene 实例化解析节点、组件和 actions

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

#### BDD-RUNTIME-002 组件生命周期必须可清理

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

#### BDD-RUNTIME-003 DOM-backed 节点必须跟随 viewport 并释放 DOM

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

### 3.4 Editor 产品层

Editor 产品层以桌面工作流为准，不维护独立浏览器版入口。

#### BDD-EDITOR-001 打开、编辑、保存 `.scene`

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

#### BDD-EDITOR-002 Zustand 只保存 UI 偏好

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

#### BDD-EDITOR-003 Inspector 修改必须转换为 SceneCommand

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

#### BDD-EDITOR-004 Component 文件拖拽添加行为组件

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

### 3.5 MCP / Agent 层

MCP 是外部 Agent 的主入口。没有 live editor 时操作项目文件；有 live editor 时转发给 live bridge。

#### BDD-MCP-001 MCP 暴露工具列表

```gherkin
Feature: MCP tools
  Scenario: Agent 请求 tools/list
    When MCP server 收到 tools/list
    Then 返回 apply_commands
    And 返回 dry_run_commands
    And 返回 get_scene
```

TDD 入口：`tests/pixifact-mcp-server.test.ts`。

#### BDD-MCP-002 dry_run_commands 不写文件

```gherkin
Feature: MCP dry run
  Scenario: Agent 预演修改文件模式 Scene
    Given projectRoot 下有 "button.scene"
    When Agent 调用 dry_run_commands
    Then 返回 diffs
    And 磁盘上的 button.scene 内容不变
```

TDD 入口：`tests/pixifact-mcp-server.test.ts`。

#### BDD-MCP-003 apply_commands 写回 `.scene`

```gherkin
Feature: MCP apply
  Scenario: Agent 应用合法命令
    Given projectRoot 下有 "button.scene"
    When Agent 调用 apply_commands
    Then MCP 使用 SceneDocument 应用命令
    And 保存后的 ".scene" 包含新值
```

TDD 入口：`tests/pixifact-mcp-server.test.ts`。

#### BDD-MCP-004 MCP 拒绝 projectRoot 外路径

```gherkin
Feature: MCP path guard
  Scenario: Agent 读取 "../outside.scene"
    Given projectRoot 指向当前项目
    When Agent 调用 get_scene with scenePath "../outside.scene"
    Then 返回 isError true
    And 错误说明文件必须在 projectRoot 内
```

TDD 入口：`tests/pixifact-mcp-server.test.ts`。

#### BDD-MCP-005 Live editor 优先路由

```gherkin
Feature: Live editor bridge
  Scenario: Live editor 已连接
    Given liveBridge.connected 为 true
    When Agent 调用 get_scene
    Then MCP 不读取磁盘文件
    And 将 tool call 路由到 liveBridge.callTool
    And 参数不包含 projectRoot
```

TDD 入口：`tests/pixifact-mcp-server.test.ts`。

### 3.6 AI Gateway 层

Gateway 只返回结构化 proposal，不直接修改项目。

#### BDD-AI-001 Gateway 返回合法 proposal response

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

#### BDD-AI-002 Gateway 拒绝无效请求和鉴权失败

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

#### BDD-AI-003 模型配置不得泄露 secret 到 prompt

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

#### BDD-AI-004 模型误报缺少 command spec 时重试

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

## 4. TDD 工作流

每个需求按以下顺序执行。

1. 写行为

   用上面的 BDD 场景或新增场景描述用户行为、系统边界和不可变规则。不要先写实现细节。

2. 选测试边界

   - Scene 格式、命令、dry-run、undo：`tests/editor.test.ts`
   - runtime、布局、生命周期：`tests/core.test.ts`
   - DOM-backed node：`tests/ui.test.ts`
   - editor 文件树 / host service：`tests/project-file-tree.test.ts`
   - editor store：`tests/editor-store.test.ts`
   - MCP：`tests/pixifact-mcp-server.test.ts`
   - gateway / model：`tests/ai-*.test.ts`

3. Red

   先写一个失败测试。测试名使用当前仓库风格：英文 `it('does ...')`，断言具体结果和副作用。中文产品文案可以直接断言中文字符串。

4. Green

   做最小实现，只满足当前测试和已存在行为。不要新增旧协议兼容、别名、fallback 或无需求的配置项。

5. Refactor

   只清理本次改动产生的重复和死代码。不要顺手重写无关模块。

6. Verify

   运行最小相关验证；跨边界改动再运行完整验证。

## 5. 需求类型到测试的映射

### 新增 SceneCommand

必须先覆盖：

- `validateCommand` 接受合法 payload。
- `validateCommand` 拒绝错误 node、错误 prop、错误 parent 或错误 component。
- `applySceneCommand` 修改正确字段。
- `dryRunCommands` 返回 diff 且不改源 Scene。
- `SceneDocument.apply` 设置 dirty，写入 undo stack。
- undo / redo 恢复状态。
- 如果 MCP 暴露该命令，补 `dry_run_commands` 和 `apply_commands` 文件模式测试。

验证命令：

```bash
bunx --no-install vitest run tests/editor.test.ts tests/pixifact-mcp-server.test.ts
```

### 新增 Scene 模板

必须先覆盖：

- 模板返回的根节点是 `container`。
- 组合控件不成为基础 `SceneNodeKind`。
- 子节点 key / component id 稳定且不冲突。
- `instantiate` 后 runtime nodes / components 可定位。
- editor template library 可创建该模板节点。

验证命令：

```bash
bunx --no-install vitest run tests/editor.test.ts tests/unity-ui.test.ts
```

### 修改 Inspector / Editor 面板

必须先覆盖：

- 数据流从 UI event 转成 `SceneCommand`。
- `SceneDocument` 是唯一 project data source。
- Zustand 只保存 UI 偏好。
- 纯图标按钮有 `aria-label` 和 `title`。
- 中文文案符合 `AGENTS.md` 的中英混用规则。

验证命令：

```bash
bunx --no-install vitest run tests/editor-store.test.ts tests/editor.test.ts
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
bun run editor:frontend:build
```

### 修改 Runtime / Layout / Component

必须先覆盖：

- runtime API 使用 `GameObject.instantiate(Type, parent, props?)`。
- 组件 lifecycle：`awake`、`start`、`update`、`onDestroy`。
- event listener 在 `onDestroy` 清理。
- layout 使用逻辑 `width` / `height`。
- leaf render nodes 不获得 child APIs。

验证命令：

```bash
bunx --no-install vitest run tests/core.test.ts tests/ui.test.ts tests/unity-ui.test.ts
bun run build
bun run example:build
```

### 修改 MCP

必须先覆盖：

- tools/list schema。
- live bridge connected 和 file mode 两条路径。
- `projectRoot` path guard。
- dry-run 不写文件。
- apply 写回 `.scene`。
- 错误作为 MCP tool content 返回，不用 process crash 表达用户错误。

验证命令：

```bash
bunx --no-install vitest run tests/pixifact-mcp-server.test.ts
```

### 修改 AI Gateway / Model Adapter

必须先覆盖：

- request protocol validation。
- unauthorized request。
- invalid model proposal。
- Chat Completions / Responses request body。
- upstream URL normalize。
- auth header 和 envKey token。
- secrets 不进入 prompt。
- timeout 和 upstream error。

验证命令：

```bash
bunx --no-install vitest run tests/ai-gateway-adapter.test.ts tests/ai-gateway-config.test.ts tests/ai-model-adapter.test.ts tests/mock-ai-server.test.ts
```

## 6. Definition of Done

一个 Pixifact 行为只有同时满足以下条件才算完成：

- BDD 场景能解释用户行为、系统边界和失败状态。
- 至少一个自动化测试覆盖主要成功路径。
- 关键失败路径有测试，尤其是 invalid command、locked prop、path guard、invalid protocol、secret handling。
- 真实修改通过 `SceneDocument` API 或 `SceneCommand`。
- dry-run 不改变源 Scene，apply 才改变 Scene。
- editor UI 没有保存 `SceneSpec` / `SceneDocument` 副本到 Zustand。
- 相关最小验证通过。
- 涉及 editor 前端时，TypeScript strict check 和 `editor:frontend:build` 通过。
- 涉及 runtime / public exports 时，`bun run build` 通过。
- 不提交 `apps/editor/dist`、`packages/pixifact/dist`、`test-results`、`apps/editor/src-tauri/target` 等产物。

## 7. 当前测试缺口和优先级

### P0：`.scene` 创建、打开、保存、MCP 修改、editor 预览的端到端覆盖

目标场景：

```gherkin
Feature: Scene edit loop
  Scenario: 用户从文件树打开 Scene，Agent 通过 MCP 修改，editor preview 更新并保存
    Given desktop editor 打开一个项目
    And 文件树中存在 scenes/Button.scene
    When 用户打开 Button.scene
    And Agent 通过 MCP dry-run 修改 label
    And 用户 review diff 并 apply
    Then SceneDocument 更新
    And Viewport preview 更新
    And 保存后磁盘 ".scene" 包含新 label
```

落地方式：先补 service / MCP / document 集成测试；桌面主流程后续通过 Tauri host 自动化或手动验证，不恢复浏览器版 editor E2E。

### P0：Live MCP bridge 和 SceneDocument 的真实联动

目标场景：

```gherkin
Feature: Live editor MCP bridge
  Scenario: MCP 调用 connected editor 的当前 Scene
    Given editor 当前打开 Menu.scene
    And live bridge connected
    When Agent 调用 apply_commands
    Then 命令应用到当前 SceneDocument
    And 不写未打开的磁盘文件
```

落地方式：扩展 live bridge server / editor automation 的测试替身，覆盖 connected path 的参数和副作用。

### P1：Inspector 节点类型专属字段

目标场景：

```gherkin
Feature: Node-specific Inspector
  Scenario: 用户选择 text 节点
    Given 当前选择 text node
    When Inspector 渲染字段
    Then 展示 text.value、text.color、text.fontSize
    And 不展示 image.src 或 shape.radius
```

落地方式：先测 `InspectorModel`，必要时补 panel test。

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

落地方式：`tests/editor.test.ts` + `tests/ui.test.ts`。

### P1：AI proposal repair loop 面向 MCP / gateway 的一致性

目标场景：

```gherkin
Feature: Agent repair loop
  Scenario: AI 第一次返回 invalid command
    Given proposal command 指向 missing node
    When dry-run 失败
    Then repair prompt 包含 Pixifact 校验错误
    And 第二次 proposal 通过 dry-run 后才 apply
```

落地方式：当前 `executeAiPrompt` 已有基础测试；后续要补 MCP/gateway path 的一致性。

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

## 8. 新测试命名约定

- 文件名沿用 `tests/<area>.test.ts`。
- `describe` 使用模块或行为边界，例如 `describe('SceneDocument')`。
- `it` 使用英文、现在时、可读行为描述，例如 `it('dry-runs commands without writing the Scene file')`。
- 中文产品文案在断言中保留中文，例如 `expect(error).toContain('未通过 Pixifact 校验')`。
- 一个测试只验证一个行为主轴；跨 editor / MCP / file / runtime 的大闭环用集成测试，不把所有细节塞进单元测试。

## 9. 最小验证速查

```bash
# 全量测试
bun run test

# Editor 类型检查
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx

# Editor 前端构建
bun run editor:frontend:build

# Runtime / package 构建
bun run build

# Example 构建
bun run example:build
```

