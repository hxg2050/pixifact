# Pixifact TDD

本文档定义 Pixifact 的测试驱动开发策略：测试边界、测试地图、Red / Green / Refactor 流程、需求类型到测试的映射和验证命令。

行为规格和验收场景见 [BDD.md](./BDD.md)。统一入口见 [TESTING.md](./TESTING.md)。

## 1. 测试原则

- 先写行为，再写实现：新需求先补一个最小失败测试或一个可执行验收场景。
- 测试公共语义层：优先覆盖 `pixifact` public exports、compiler `.scene` parser / validator、`SceneDocument`、editor services 和 CLI entrypoint。
- 不为旧 API 写兼容测试：项目处于开发阶段，不新增 legacy path、alias、fallback 或 deprecation shim。
- 不测试静默默认值：除非需求明确，测试应让错误自然暴露，并断言真实失败原因。
- 不让 UI state 成为项目数据源：测试必须确认项目数据来自 `.scene` 文件、compiler scene document 或必要的 `SceneDocument` 内部状态，而不是 Zustand 副本。
- 行为测试用稳定 locator：compiler scene 节点用 hierarchy locator / `id`，legacy Scene 节点用 `key` / `id`，组件用 `id`，文件用 project-relative path。
- 先最小验证，再扩大范围：每次改动优先运行最小相关测试，跨边界改动再运行完整 `bun run test` 和构建。

## 2. 现有测试地图

| 文件 | 责任边界 | 当前覆盖重点 |
| --- | --- | --- |
| `tests/core.test.ts` | runtime foundation | `GameObject`、transform、children、layout、lifecycle、ticker |
| `tests/ui.test.ts` | DOM-backed runtime nodes | `Input`、`Textarea`、`ScrollRect`、DOM cleanup、viewport transform |
| `tests/unity-ui.test.ts` | runtime component metadata + template slice | component schema、Button runtime composition、Scene DSL instantiate |
| `tests/editor.test.ts` | authoring semantic layer | `SceneDocument`、internal commands、undo/redo、locks、memory、logic |
| `tests/editor-store.test.ts` | editor UI store | Zustand 只持久化轻量偏好，不保存 project data / secrets |
| `tests/project-file-tree.test.ts` | desktop project file service | `.scene` 创建保存、文件树分类、重命名、删除、scene instance key isolation |
| `tests/project-run-config.test.ts` | project run config service | `pixifact.project.json` 解析、path guard、run command 参数、summary 数据 |
| `tests/editor-run-service.test.ts` | editor run service / host bridge | 运行状态、spawn 参数、stdout / stderr 摘要、停止 session、失败状态 |
| `tests/pixifact-cli.test.ts` | Pixifact CLI | summary、scene inspect/validate、path guard、read-only live context、exit code |
| `tests/editor-live-context-ui.test.ts` | Editor live context UI | external compiler scene refresh state |

新增测试应先落到这些既有边界；只有当行为无法归入现有边界时，才新增测试文件。

## 3. TDD 工作流

每个需求按以下顺序执行。

1. 写行为

   用 [BDD.md](./BDD.md) 中的场景或新增场景描述用户行为、系统边界和不可变规则。不要先写实现细节。

2. 选测试边界

   - compiler `.scene` parser / validator：`tests/pixifact-cli.test.ts`
   - SceneDocument 内部命令、undo、memory、logic：`tests/editor.test.ts`
   - runtime、布局、生命周期：`tests/core.test.ts`
   - DOM-backed node：`tests/ui.test.ts`
   - editor 文件树 / host service：`tests/project-file-tree.test.ts`
   - project run config：`tests/project-run-config.test.ts`
   - editor run service：`tests/editor-run-service.test.ts`
   - editor store：`tests/editor-store.test.ts`
   - CLI / Agent live context：`tests/pixifact-cli.test.ts`

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

### 修改 Editor live context

必须先覆盖：

- `live summary` 返回项目、当前文件和 scene 列表。
- `live scene get` 返回当前 compiler scene 或 legacy SceneDocument 的只读上下文。
- `live node inspect` 返回当前选中或指定节点的稳定 locator、类型和 props。
- live bridge 不暴露 mutation action。

验证命令：

```bash
bunx --no-install vitest run tests/pixifact-cli.test.ts
```

### 修改 SceneDocument 内部命令

必须先覆盖：

- `validateCommand` 接受合法 payload。
- `validateCommand` 拒绝错误 node、错误 prop、错误 parent 或错误 component。
- `applySceneCommand` 修改正确字段。
- `SceneDocument.apply` 设置 dirty，写入 undo stack。
- undo / redo 恢复状态。
- 新能力不重新暴露为外部 Agent CLI mutation 协议。

验证命令：

```bash
bunx --no-install vitest run tests/editor.test.ts tests/pixifact-cli.test.ts
```

### 新增 Scene 模板或 runtime UI 能力

必须先覆盖：

- 模板返回的根节点结构稳定。
- 子节点 key / component id 稳定且不冲突。
- `instantiate` 后 runtime nodes / components 可定位。
- editor template library 可创建该模板节点。

验证命令：

```bash
bunx --no-install vitest run tests/editor.test.ts tests/unity-ui.test.ts
```

### 修改 Inspector / Editor 面板

必须先覆盖：

- 数据流写入 compiler scene document 或必要的 `SceneDocument` 内部命令。
- 节点类型专属 display 字段过滤正确。
- Zustand 只保存 UI 偏好。
- 纯图标按钮有 `aria-label` 和 `title`。
- 中文文案符合 `AGENTS.md` 的中英混用规则。

验证命令：

```bash
bunx --no-install vitest run tests/editor-store.test.ts tests/editor.test.ts tests/project-file-tree.test.ts
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

## 5. Definition of Done

一个 Pixifact 行为只有同时满足以下条件才算完成：

- BDD 场景能解释用户行为、系统边界和失败状态。
- 至少一个自动化测试覆盖主要成功路径。
- 关键失败路径有测试，尤其是 invalid scene、path guard、asset/contract validation。
- 外部 Agent 修改路径是 `.scene` direct edit + validation。
- Editor live context 是只读增强，不写项目文件。
- editor UI 没有保存 `SceneSpec` / `SceneDocument` 副本到 Zustand。
- 相关最小验证通过。
- 涉及 editor 前端时，TypeScript strict check 和 `editor:frontend:build` 通过。
- 涉及 runtime / public exports 时，`bun run build` 通过。
- 不提交 `apps/editor/dist`、`packages/pixifact/dist`、`test-results`、`apps/editor/src-tauri/target` 等产物。

## 6. 最小验证速查

```bash
# 全量测试
bun run test

# Editor 类型检查
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx

# Editor 前端构建
bun run editor:frontend:build
```
