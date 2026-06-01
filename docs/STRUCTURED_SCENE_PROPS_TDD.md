# Structured Scene Props TDD

本文定义 structured Scene props 的测试驱动实施计划。需求说明见 [STRUCTURED_SCENE_PROPS_REQUIREMENTS.md](./STRUCTURED_SCENE_PROPS_REQUIREMENTS.md)，行为验收见 [STRUCTURED_SCENE_PROPS_BDD.md](./STRUCTURED_SCENE_PROPS_BDD.md)。全局测试规范见 [TDD.md](./TDD.md)。

## 1. 测试边界

新增或扩展以下测试：

```txt
tests/scene-script-interface.test.ts
tests/scene-compiler.test.ts
tests/project-file-tree.test.ts
tests/editor-workbench-ui.test.ts
```

如 compiler command 层需要 nested prop 更新，可扩展：

```txt
tests/compiler-scene-commands.test.ts
tests/compiler-scene-document-controller.test.ts
```

## 2. Phase 1: Contract 类型和 decorator API

先写失败测试：

1. `extractSceneScriptInterface` 接受 `@prop({ type: String, default: 'Button' })`。
2. `extractSceneScriptInterface` 接受 `@prop({ type: Number, default: 0 })`。
3. `extractSceneScriptInterface` 接受 `@prop({ type: Boolean, default: false })`。
4. 旧字符串写法被拒绝：`@prop({ type: 'string' })`。
5. runtime `prop({ type: String })` 返回 decorator function。

Green 目标：

- `ScenePropDecoratorOptions.type` 支持 constructor。
- `decorators.ts` 保存 constructor metadata。
- `scriptInterfaceExtractor.ts` 将 `String`、`Number`、`Boolean` 映射为 JSON contract 中的 `string`、`number`、`boolean`。
- 迁移仓库内现有 `@prop({ type: '...' })`。

最小验证：

```bash
bunx --no-install vitest run tests/scene-script-interface.test.ts tests/scene-compiler.test.ts tests/project-file-tree.test.ts
```

## 3. Phase 2: Struct contract 提取

先写失败测试：

1. 同文件导出的 `RectTransform` class 可被 `@prop({ type: RectTransform })` 引用。
2. `RectTransform` 字段 `x/y/width/height` 被提取为 number fields。
3. 字段默认值来自 class field initializer。
4. 方法不进入 fields。
5. 缺少 class 声明时报错。
6. struct 字段使用非 primitive initializer 或非 primitive 类型时报错。
7. struct constructor 带必填参数时报错，要求无参构造。

Green 目标：

- `SceneTemplatePropContract` 增加 struct contract。
- `scriptInterfaceExtractor.ts` 能解析 decorator object literal 中的 identifier value。
- 提取 plain class public field schema。
- 输出稳定 JSON descriptor。

最小验证：

```bash
bunx --no-install vitest run tests/scene-script-interface.test.ts
```

## 4. Phase 3: `.scene` 点路径 parser / serializer

先写失败测试：

1. parser 将 `rectTransform.x="150"` 合并到 `props.rectTransform.x`。
2. parser 支持多个字段合并到同一对象。
3. parser 拒绝同一个 prop 同时使用 scalar 和 dot-path。
4. serializer 将 object prop 写回 dot-path attributes。
5. serializer 不输出 JSON string。

Green 目标：

- `SceneTemplateValue` 支持 struct object value。
- `templateParser.ts` 支持点路径属性。
- `templateSerializer.ts` 支持 object prop 展平为点路径。

最小验证：

```bash
bunx --no-install vitest run tests/scene-compiler.test.ts
```

## 5. Phase 4: Validation

先写失败测试：

1. `rectTransform.foo` 被拒绝。
2. `rectTransform.width="wide"` 被拒绝。
3. primitive prop 仍按 contract 校验。
4. Pixi 基础节点使用 struct dot-path 被拒绝或按 unknown prop 处理。
5. `.scene` 中未设置的 struct 字段允许缺省，由 runtime struct initializer 保留默认值。

Green 目标：

- `sceneValidation.ts` 支持 struct contract field 校验。
- diagnostics 明确指出 prop path，例如 `rectTransform.width`。

最小验证：

```bash
bunx --no-install vitest run tests/scene-compiler.test.ts tests/pixifact-cli.test.ts
```

## 6. Phase 5: TypeScript compiler 输出

先写失败测试：

1. Scene Instance struct prop 编译为 `new RectTransform()`。
2. 编译输出逐字段赋值。
3. 编译输出将实例赋给 scene instance setter。
4. 编译输出不使用 plain object。
5. 编译输出导入 struct 类型。第一版可要求 struct 与 Scene class 从同一 script import 导出。

Green 目标：

- `typescriptCompiler.ts` 的 `#value` 或 Scene Instance prop 分支支持 struct object。
- 编译上下文知道 prop contract 中的 struct name 和 import source。
- 生成变量名稳定，不与 node id 冲突。

最小验证：

```bash
bunx --no-install vitest run tests/scene-compiler.test.ts tests/pixifact-cli.test.ts
```

## 7. Phase 6: Editor document nested prop 更新

先写失败测试：

1. controller 可更新 `rectTransform.width`。
2. 更新 nested prop 后 undo 恢复原值。
3. 保存后 serializer 输出 dot-path。
4. external binding refresh 不丢失 struct contract。

Green 目标：

- compiler scene command / controller 支持 nested prop path，或通过 object replacement 实现等价行为。
- undo/redo inverse 保留 nested path 修改前值。

最小验证：

```bash
bunx --no-install vitest run tests/compiler-scene-commands.test.ts tests/compiler-scene-document-controller.test.ts tests/project-file-tree.test.ts
```

## 8. Phase 7: Inspector UI

先写失败测试：

1. 选中 Scene Instance 时 RectTransform 显示为 grouped section。
2. `x/y/width/height` 显示为 number input。
3. 修改 width 后 document 中的 `rectTransform.width` 更新。
4. 保存后 `.scene` 中包含 `rectTransform.width="..."`。
5. Pixi 基础节点 Inspector 不出现 RectTransform 分组。

Green 目标：

- `InspectorPanel.tsx` 根据 struct contract 构建 section。
- struct field 复用现有 editable field 输入和 commit-on-blur 逻辑。
- field label 先使用字段名格式化；后续再引入 display metadata。

最小验证：

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts tests/project-file-tree.test.ts
bun run editor:frontend:build
```

## 9. Phase 8: Sample project 验证

先写失败测试或手动验证清单：

1. `sample-projects/space-hud-game/src/scenes/Button.ts` 使用 `@prop({ type: RectTransform })`。
2. `GameOver.scene` 使用 Button scene instance 的 dot-path rectTransform。
3. `pixifact scene validate` 通过。
4. `pixifact compile-scenes` 通过。
5. sample project build 通过。

验证命令：

```bash
bunx --no-install vitest run tests/scene-script-interface.test.ts tests/scene-compiler.test.ts tests/project-file-tree.test.ts tests/editor-workbench-ui.test.ts
bun run test
bun run editor:frontend:build
```

## 10. Definition of Done

- BDD 场景全部有对应自动化测试或明确验证命令。
- 旧字符串 `@prop({ type: '...' })` 全部迁移。
- CLI 和 Editor 都消费同一份 structured contract。
- `.scene` 仍然可读、可 diff、可由 Agent 直接编辑。
- struct prop runtime 值是真实 class 实例。
- 不新增旧 API 兼容层。
- 不提交生成产物。
