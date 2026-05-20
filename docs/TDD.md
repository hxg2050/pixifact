# Pixifact TDD

本文档定义 Pixifact 的测试驱动开发策略：测试边界、测试地图、Red / Green / Refactor 流程、需求类型到测试的映射和验证命令。

行为规格和验收场景见 [BDD.md](./BDD.md)。统一入口见 [TESTING.md](./TESTING.md)。

## 1. 测试原则

- 先写行为，再写实现：新需求先补一个最小失败测试或一个可执行验收场景。
- 测试公共语义层：优先覆盖 `pixifact` public exports、`SceneDocument`、`SceneCommand`、editor services、CLI entrypoint 和 gateway core。
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
| `tests/pixifact-cli.test.ts` | Pixifact CLI | summary、scene get、node inspect、commands dry-run/apply/validate、path guard、live bridge routing、exit code |
| `tests/ai-gateway-adapter.test.ts` | gateway protocol shell | proposal response、auth、invalid request、invalid model proposal |
| `tests/ai-gateway-config.test.ts` | gateway config | local defaults、env token、model adapter env mapping |
| `tests/ai-model-adapter.test.ts` | upstream model adapter | Chat Completions / Responses body、URL normalize、secret handling、retry、timeout |
| `tests/mock-ai-server.test.ts` | mock remote AI | mock proposal protocol、invalid payload |

新增测试应先落到这些既有边界；只有当行为无法归入现有边界时，才新增测试文件。

## 3. TDD 工作流

每个需求按以下顺序执行。

1. 写行为

   用 [BDD.md](./BDD.md) 中的场景或新增场景描述用户行为、系统边界和不可变规则。不要先写实现细节。

2. 选测试边界

   - Scene 格式、命令、dry-run、undo：`tests/editor.test.ts`
   - runtime、布局、生命周期：`tests/core.test.ts`
   - DOM-backed node：`tests/ui.test.ts`
   - editor 文件树 / host service：`tests/project-file-tree.test.ts`
   - editor store：`tests/editor-store.test.ts`
   - CLI / Agent：`tests/pixifact-cli.test.ts`
   - gateway / model：`tests/ai-*.test.ts`

3. Red

   先写一个失败测试。测试名使用当前仓库风格：英文 `it('does ...')`，断言具体结果和副作用。中文产品文案可以直接断言中文字符串。

4. Green

   做最小实现，只满足当前测试和已存在行为。不要新增旧协议兼容、别名、fallback 或无需求的配置项。

5. Refactor

   只清理本次改动产生的重复和死代码。不要顺手重写无关模块。

6. Verify

   运行最小相关验证；跨边界改动再运行完整验证。

## 4. 需求类型到测试的映射

### 新增 SceneCommand

必须先覆盖：

- `validateCommand` 接受合法 payload。
- `validateCommand` 拒绝错误 node、错误 prop、错误 parent 或错误 component。
- `applySceneCommand` 修改正确字段。
- `dryRunCommands` 返回 diff 且不改源 Scene。
- `SceneDocument.apply` 设置 dirty，写入 undo stack。
- undo / redo 恢复状态。
- 如果 CLI 暴露该命令，补 `commands dry-run` 和 `commands apply` 文件模式测试。

验证命令：

```bash
bunx --no-install vitest run tests/editor.test.ts tests/pixifact-cli.test.ts
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
- 节点类型专属 display 字段由 `InspectorModel` 过滤：`text` 不展示 image / shape 字段，`input` 不展示 image / shape 字段，`container` 不展示 display data。
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

### 修改 CLI / Agent 入口

必须先覆盖：

- `summary`、`scene get`、`node inspect`、`commands dry-run`、`commands apply`、`commands validate`。
- `scene create` 创建标准 `.scene` 且不覆盖已有文件。
- 文件模式和 live mode 的 `template add dry-run/apply` 将短参数展开为 `SceneCommand[]`，并复用 dry-run / apply 语义。
- live bridge connected 和 file mode 两条路径。
- `projectRoot` path guard。
- dry-run 不写文件。
- apply 写回 `.scene`。
- `--commands` 支持文件和 stdin。
- 错误输出 JSON，并返回非 0 exit code。

验证命令：

```bash
bunx --no-install vitest run tests/pixifact-cli.test.ts
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

## 5. Definition of Done

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

## 6. 新测试命名约定

- 文件名沿用 `tests/<area>.test.ts`。
- `describe` 使用模块或行为边界，例如 `describe('SceneDocument')`。
- `it` 使用英文、现在时、可读行为描述，例如 `it('dry-runs commands without writing the Scene file')`。
- 中文产品文案在断言中保留中文，例如 `expect(error).toContain('未通过 Pixifact 校验')`。
- 一个测试只验证一个行为主轴；跨 editor / CLI / file / runtime 的大闭环用集成测试，不把所有细节塞进单元测试。

## 7. 最小验证速查

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
