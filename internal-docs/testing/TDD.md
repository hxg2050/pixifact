# Pixifact TDD

本文档定义 Pixifact 的测试驱动开发策略：测试边界、测试地图、Red / Green / Refactor 流程、需求类型到测试的映射和验证命令。

行为规格和验收场景见 [BDD.md](./BDD.md)。统一入口见 [TESTING.md](./TESTING.md)。

## 1. 测试原则

- 先写行为，再写实现：新需求先补一个最小失败测试或一个可执行验收场景。
- 测试公共语义层：优先覆盖 `pixifact` public exports、compiler `.scene` parser / validator、editor services 和 CLI entrypoint。
- 不为旧 API 写兼容测试：项目处于开发阶段，不新增 legacy path、alias、fallback 或 deprecation shim。
- 不测试静默默认值：除非需求明确，测试应让错误自然暴露，并断言真实失败原因。
- 不让 UI state 成为项目数据源：测试必须确认项目数据来自 `.scene` 文件或 `SceneDocument`，而不是 Pinia 副本。
- 行为测试用稳定 locator：compiler scene 节点用 hierarchy locator / `id`，文件用 project-relative path。
- 先最小验证，再扩大范围：每次改动优先运行最小相关测试，跨边界改动再运行完整 `bun run test` 和构建。

## 2. 现有测试地图

| 文件 | 责任边界 | 当前覆盖重点 |
| --- | --- | --- |
| `tests/editor-vue-ui.test.ts` | Vue Editor UI / Pinia | Inspector preview / commit、手动刷新与 Pinia 项目数据边界 |
| `tests/editor-scene-document.test.ts` | vNext `SceneDocument` | versioned auto-save、Undo / Redo、文件通知协调 |
| `tests/editor-server.test.ts` | 浏览器 Editor 本地服务 | 项目索引、Scene versioned write、project root guard |
| `tests/project-file-tree.test.ts` | 浏览器 Editor 项目树与 runtime preview | 浏览器文件读取、Scene binding、Pixi 节点布局和图片 parser |
| `tests/project-run-config.test.ts` | project run config service | `pixifact.project.json` 解析、path guard、run command 参数、summary 数据 |
| `tests/pixifact-cli.test.ts` | Pixifact CLI | summary、scene inspect/validate、Editor context 路由、path guard、旧 live 命令移除、exit code |
| `tests/editor-session.test.ts` | Editor Host session / context | 单浏览器会话、context auth、revision 一致性、session discovery |
| `tests/editor-context.test.ts` | Editor context / selection | Scene 与节点 context、Compiler locator、外部 revision 选择重定位 |
| `tests/scene-script-interface.test.ts` | compiler Scene script contract | `@scene` / `@prop` / `@event` / `@slot` / `@part` 提取，primitive 和 structured prop contract |
| `tests/scene-compiler.test.ts` | compiler `.scene` parser / serializer / validator / codegen | scene source canonicalization、scene instance contract、structured prop dot-path、generated TypeScript |
| `tests/compiler-scene-commands.test.ts` | compiler scene internal commands | node prop 更新、nested prop path、undo/redo inverse |

新增测试应先落到这些既有边界；只有当行为无法归入现有边界时，才新增测试文件。

## 3. TDD 工作流

每个需求按以下顺序执行。

1. 写行为

   用 [BDD.md](./BDD.md) 中的场景或新增场景描述用户行为、系统边界和不可变规则。不要先写实现细节。

2. 选测试边界

   - compiler `.scene` parser / validator：`tests/scene-compiler.test.ts`、`tests/pixifact-cli.test.ts`
   - compiler scene command / undo：`tests/compiler-scene-commands.test.ts`、`tests/editor-scene-document.test.ts`
   - runtime `Group` / compiler output：`tests/scene-compiler.test.ts` 和 sample project build
   - editor 本地服务 / runtime preview：`tests/editor-server.test.ts`、`tests/project-file-tree.test.ts`
   - project run config：`tests/project-run-config.test.ts`
   - Vue editor store / Inspector：`tests/editor-vue-ui.test.ts`
   - CLI / Agent commands：`tests/pixifact-cli.test.ts`

3. Red

   先写一个失败测试。测试名使用当前仓库风格：英文 `it('does ...')`，断言具体结果和副作用。中文产品文案可以直接断言中文字符串。

4. Green

   做最小实现，只满足当前测试和已存在行为。不要新增旧协议兼容、别名、fallback 或无需求的配置项。

5. Refactor

   只清理本次改动产生的重复和死代码。不要顺手重写无关模块。

6. Verify

   运行最小相关验证；跨边界改动再运行完整验证。

## 4. 需求类型到测试的映射

### 修改 compiler `.scene` authoring

必须先覆盖：

- parser 接受合法 `.scene`。
- validator 拒绝错误 prop、错误类型、缺失 asset、错误 scene instance contract。
- serializer 输出 canonical source。
- direct edit 后 `scene validate` 和 `compile-scenes` 通过。

验证命令：

```bash
bunx --no-install vitest run tests/pixifact-cli.test.ts tests/scene-compiler.test.ts
```

### 修改 Scene script public contract

必须先覆盖：

- `@prop({ default }) declare property: primitive` 从 TypeScript property type 提取 primitive contract。
- `@prop` 拒绝 setter、getter、accessor、method、field initializer 和动态 default。
- `defineVariants({...})` 只提取同文件静态对象，并校验 case 字段集合与类型一致。
- Variant default 必须引用已有 case，动态函数调用或运行时值必须被拒绝。
- struct prop 使用导出的同文件 class，例如 `RectTransform`。
- struct class 必须可无参构造。
- struct fields 只支持带 primitive initializer 的字段。
- struct prop default 来自 class field initializer，不接受 `@prop` default。
- 子 Scene 继承父 Scene 的 `@prop` / `@event` / `@slot` contract。
- 父类解析优先使用同文件父类或相对 named import，不能只靠 class name 猜测。
- 同名跨文件父类没有明确 import 时必须报歧义。
- 继承来的 struct prop 必须从声明它的 Scene script 导入构造类型。
- 内置 Scene contract 必须从 decorator source extraction 得到，不能新增硬编码 prop 表。
- CLI `scene inspect` 必须展示合成后的 public interface，包括 inherited props / slots。

验证命令：

```bash
bunx --no-install vitest run tests/scene-script-interface.test.ts tests/scene-compiler.test.ts tests/pixifact-cli.test.ts
```

### 修改 Scene Binding

必须先覆盖：

- parser / serializer 往返保留 `{prop}` 与 `{variant.field}`，不把绑定误解析成普通字符串或颜色。
- validator 拒绝未知 Prop、未知 Variant field、非法 binding path 和目标类型不匹配。
- compiler 在 Scene 挂载前合并默认值与构造参数。
- Prop 后续赋值只执行依赖该 Prop 的生成更新函数，不重新挂载 Scene。
- 绑定属性只有一个框架写入来源，不调用用户 setter。
- 第一版不接受表达式、字符串插值、双向绑定或深层对象 mutation。

验证命令：

```bash
bunx --no-install vitest run tests/scene-script-interface.test.ts tests/scene-compiler.test.ts tests/project-file-tree.test.ts
bun run build
```

### 修改 structured Scene props

必须先覆盖：

- parser 将 `rectTransform.width="420"` 合并成 nested prop。
- serializer 将 nested prop 写回 dot-path attribute。
- validator 根据 referenced Scene contract 校验 struct field 名称和类型。
- compiler 生成 `new RectTransform()` 和逐字段赋值，不生成 plain object。
- command / controller 更新 `rectTransform.width` 后 undo 能恢复。
- Inspector 将 struct prop 显示为字段组，而不是 JSON 输入框。

验证命令：

```bash
bunx --no-install vitest run tests/scene-script-interface.test.ts tests/scene-compiler.test.ts tests/compiler-scene-commands.test.ts tests/editor-scene-document.test.ts tests/editor-vue-ui.test.ts
bun run editor:frontend:build
```

### 修改 Editor context

必须先覆盖：

- `editor context` 只从当前项目已注册的 Editor Host 读取状态。
- Host 同时只接受一个浏览器 WebSocket 会话，第二个页面不能发布 context。
- context 只在 Scene 磁盘 revision 与浏览器 revision 一致且同步状态为 `synced` 时成功。
- Scene 根、Pixi 节点、Scene Instance 和 Slot Outlet 使用明确的 selection kind。
- 节点地址直接复用 Compiler locator，不新增第二套 locator。
- 旧 `live ...` 继续返回 unknown command，不恢复固定端口 bridge。

验证命令：

```bash
bunx --no-install vitest run tests/pixifact-cli.test.ts tests/editor-session.test.ts tests/editor-context.test.ts
```

### 修改 compiler scene 内部命令

必须先覆盖：

- `applyCompilerSceneCommand` 接受合法 payload。
- `applyCompilerSceneCommand` 拒绝错误 node、错误 prop、错误 parent 或错误 slot。
- `CompilerSceneCommandStack` 写入 undo stack。
- undo / redo 恢复状态。
- 新能力不重新暴露为外部 Agent CLI mutation 协议。

验证命令：

```bash
bunx --no-install vitest run tests/compiler-scene-commands.test.ts tests/editor-scene-document.test.ts tests/pixifact-cli.test.ts
```

### 新增 compiler Scene primitive 或 runtime 能力

必须先覆盖：

- `.scene` parser / serializer 能表达新增节点或字段。
- validator 能拒绝错误字段和值类型。
- compiler 生成的 PixiJS / Pixifact runtime 代码正确。
- editor hierarchy / inspector / viewport 能识别新增节点或字段。

验证命令：

```bash
bunx --no-install vitest run tests/scene-compiler.test.ts tests/project-file-tree.test.ts tests/editor-vue-ui.test.ts
bun run build
```

### 修改 Inspector / Editor 面板

必须先覆盖：

- 数据流写入 compiler scene document。
- 节点类型专属 display 字段过滤正确。
- Pinia 只保存 UI 偏好。
- 纯图标按钮有 `aria-label` 和 `title`。
- 手动刷新重新读取项目索引、Scene interface 和当前 Scene，同 revision 不清空选择与 Undo / Redo。
- 中文文案符合 `AGENTS.md` 的中英混用规则。

验证命令：

```bash
bunx --no-install vitest run tests/editor-vue-ui.test.ts tests/editor-scene-document.test.ts
bun run editor:typecheck
bun run editor:frontend:build
```

### 修改 Editor Authoring preview

必须先覆盖：

- Editor 读取 Host 提供的静态 Scene interface，不在浏览器编译或执行项目 TypeScript。
- 模块顶层、constructor、setter、onMounted、事件、timer 和网络代码均不在 Authoring 中运行。
- `.scene` 直接绑定与 Variant 绑定能显示默认值和 Scene Instance 初始值。
- Inspector 连续输入原地更新绑定节点，不替换 Pixi Application、Canvas 或当前 Scene root。
- 手动刷新可重建引用图片的预览内容，但不替换 Pixi Application 或 Canvas。
- Scene Instance 保持 opaque；父 Scene 只编辑公开 Props、Events 和 slot children。

验证命令：

```bash
bunx --no-install vitest run tests/project-file-tree.test.ts tests/editor-vue-ui.test.ts tests/editor-scene-document.test.ts
bun run editor:typecheck
bun run editor:frontend:build
```

### 修改 Runtime / Group

必须先覆盖：

- `Container` 保持 PixiJS 原生语义，尤其是 `width` / `height` 的 bounds / scale 行为。
- `Group.width` / `height` 表达 Pixifact 盒子尺寸，不修改 `scale`。
- compiler root 使用 `Group`，并通过 `setSize()` 写入 Scene 尺寸。
- sample project 的 scene scripts 继承 `Group`。
- 构造函数和 setter 只建立确定性的视觉、几何、布局与 mask，不注册 pointer、wheel、Ticker 等游戏行为。
- decorated compiled Scene 在 parts / slots 注入后、`onMounted()` 前激活 Runtime 行为；嵌套 Scene 重复遍历保持幂等。
- Editor Authoring Preview 只构造视觉树，不调用 Runtime 行为激活入口。

验证命令：

```bash
bunx --no-install vitest run tests/scene-compiler.test.ts tests/scene-script-interface.test.ts
bun run build
```

## 5. Definition of Done

一个 Pixifact 行为只有同时满足以下条件才算完成：

- BDD 场景能解释用户行为、系统边界和失败状态。
- 至少一个自动化测试覆盖主要成功路径。
- 关键失败路径有测试，尤其是 invalid scene、path guard、asset/contract validation。
- 外部 Agent 修改路径是 `.scene` direct edit + validation。
- Editor context 是只读增强，不写项目文件。
- editor UI 没有保存 `.scene` source 或 `SceneDocument` 副本到 Pinia。
- 相关最小验证通过。
- 涉及 editor 前端时，TypeScript strict check 和 `editor:frontend:build` 通过。
- 涉及 runtime / public exports 时，`bun run build` 通过。
- 不提交 `packages/pixifact-cli/editor`、`apps/editor/dist`、`packages/pixifact/dist`、`test-results` 等产物。

## 6. 最小验证速查

```bash
# 全量测试
bun run test

# Editor 类型检查
bun run editor:typecheck

# Editor 前端构建
bun run editor:frontend:build
```
