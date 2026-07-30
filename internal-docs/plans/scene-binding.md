# Scene Binding

状态：完成
权威范围：Scene 静态 Prop、Variant、声明式绑定、运行时构造和 Editor Authoring 预览
上游文档：[./index.md](./index.md)、[../testing/TESTING.md](../testing/TESTING.md)
下游文档：Compiler / Runtime / Editor 实现与对外 Scene authoring 文档
更新规则：本任务的设计决策、实现进度或验证方式变化时更新

## Goal

实现一套由配对 TypeScript 静态声明、由 `.scene` 绑定、由 Compiler 生成定向更新代码的 Scene Binding。Scene 实例构造参数必须在节点挂载前生效；后续 Prop 修改只更新依赖节点，不重建 Scene，也不执行用户 setter。Editor Authoring 必须使用相同的静态契约和绑定语义，但不加载或执行项目 TypeScript。

## Decisions

- 同 basename 的 `.scene` 与 `.ts` 共同定义 Scene：`.ts` 负责公开 Prop schema、默认值、Variant 数据、Event、Part、Slot 和运行时行为；`.scene` 负责节点树、布局和绑定位置。
- `@prop` 只允许装饰无 initializer 的 `declare` property，不允许 getter、setter、accessor、method 或字段 initializer。
- 基本 Prop 从 TypeScript property type 与静态 default 提取；Variant 使用同文件 `defineVariants({...})` 静态对象声明。
- `defineVariants()` 只接受静态对象字面量；每个 case 必须包含相同字段和相同字段类型。Editor 和 Compiler 通过 AST 提取，不执行该函数。
- `.scene` 第一版只支持完整属性值形式的简单路径绑定：`{label}` 与 `{tone.background}`。不支持字符串插值或表达式。
- Scene Binding 是单向、同步、编译式更新。Compiler 生成属性访问器和依赖更新函数；不引入 Proxy、Vue runtime、watch、effect 或通用响应式依赖。
- 构造 API 为 `new SceneClass(initialProps?)`。框架在挂载节点前合并默认值与构造参数，使用最终值创建节点，挂载完成后才调用运行时 `onMounted()`。
- Editor Authoring 不导入配对脚本、不运行模块顶层、构造函数、生命周期、setter、事件、网络或定时器。它使用静态接口与 `.scene` 递归创建 authoring-safe Pixi 节点。
- 被 Scene Binding 控制的节点属性只有一个写入来源；用户 TypeScript 不应再修改这些属性。
- Editor Inspector 按值的所有者编辑：普通节点属性和 Scene Instance Prop 可直接编辑；Binding 目标只读显示解析值和语义化来源。
- 解除 Binding 时把当前解析值固化为普通 `.scene` 属性，并作为一个可 Undo / Redo 的 Scene Command；不增加 Binding 图、表达式编辑器或隐式覆盖。
- 本计划覆盖 [scene-constructor-boundary.md](./scene-constructor-boundary.md) 中“Scene 禁止构造参数”和“Editor 运行 onMounted”的旧决策，不提供旧行为兼容层。

## Non-Goals

- 任意 TypeScript 或 `.scene` 表达式。
- 双向绑定、watch、effect、computed、异步绑定或对象 / 数组深层追踪。
- 多 Prop 条件组合、完整状态机、CSS 或通用主题系统。
- 在 Editor 中执行项目脚本或模拟完整游戏行为。
- 旧 setter-based `@prop`、零参数强制规则或旧 runtime preview 的兼容入口。

## Public API / User-Facing Behavior

```ts
const buttonTones = defineVariants({
    primary: { background: '#24456f', text: '#fff3cf' },
    danger: { background: '#713044', text: '#fff0f4' },
});

@scene()
export class Button extends Group {
    @prop({ default: 'Button' })
    declare label: string;

    @prop({ default: 'primary', variants: buttonTones })
    declare tone: keyof typeof buttonTones;
}
```

```xml
<Rect id="background" fillColor="{tone.background}" />
<Text id="labelText" text="{label}" fill="{tone.text}" />
```

```ts
const button = new Button({ label: '背包', tone: 'primary' });
button.label = '仓库';
button.tone = 'danger';
```

- 初始 Prop 在首次节点创建时生效，不出现默认值闪烁或二次刷新。
- 修改 `label` 只更新 `labelText.text`；修改 `tone` 只更新绑定的样式属性。
- Editor Inspector 修改绑定值时原地更新预览；不会重新挂载 Scene。
- Editor Inspector 不允许直接覆盖 Binding 目标；它显示当前解析值与 `label`、`tone.background` 等来源。
- 用户明确解除 Binding 后，当前解析值成为普通显式值；Undo 恢复原 Binding。

## Implementation Scope

- 扩展 compiler spec、script interface extractor、template parser / serializer、validator 和 TypeScript codegen。
- 扩展 scene decorators 与 runtime，使构造参数、默认 Prop 状态、生成访问器和绑定更新按明确顺序工作。
- 将 Editor runtime preview 替换为不执行项目脚本的 Authoring renderer，并移除浏览器 TypeScript compiler 依赖链。
- 迁移仓库示例、内置 Scene、测试 fixture 和对外中英文 Scene 文档。
- 更新旧 constructor boundary 与 Editor vNext 计划中的现状说明。
- 补齐 Editor Inspector 的 Binding 来源展示、只读状态和解除 Binding Command。

## Test Plan

- [x] script interface extractor 提取 declare primitive Prop 与静态 Variant，并拒绝 setter、initializer、动态 Variant 和不一致 case。
- [x] parser / serializer 往返保留 `{label}` 与 `{tone.background}` 绑定。
- [x] validator 校验未知 Prop、未知 Variant 字段、绑定目标类型和非法路径。
- [x] codegen 在挂载前应用构造 Props，并为直接绑定与 Variant 绑定生成定向更新代码。
- [x] runtime 验证构造参数、默认值、后续赋值、生命周期顺序和无用户 setter。
- [x] Editor 验证项目 TypeScript 不被执行，Authoring 仍能正确显示默认值、实例值和 Variant。
- [x] Editor 验证 Scene Instance Inspector 修改通过生成访问器原地更新，不替换 Scene root。
- [x] Editor 验证 Binding 目标只读显示解析值与来源，解除后固化当前值，Undo 恢复 Binding。
- [x] sample projects 编译、Editor typecheck、Editor build、package build 和全量测试通过。

## Verification

```bash
rtk bun run test -- scene-script-interface.test.ts scene-compiler.test.ts
rtk bun run test -- project-file-tree.test.ts editor-vue-ui.test.ts
rtk bun run editor:typecheck
rtk bun run editor:frontend:build
rtk bun run build
rtk bun run test
```

## Progress

- [x] 确认产品与安全边界。
- [x] 确认 Props 返回配对 TypeScript，`.scene` 只保留绑定。
- [x] 写入 BDD 与失败测试。
- [x] 实现静态 Prop / Variant contract。
- [x] 实现 `.scene` Binding AST、校验与 codegen。
- [x] 实现 Runtime 构造与定向更新。
- [x] 实现无脚本 Editor Authoring preview。
- [x] 迁移示例和文档。
- [x] 完成验证与提交。
- [x] 补齐 Binding Inspector 展示、解除和 Undo / Redo。

## Resume Protocol

1. 阅读 `AGENTS.md`、`CODEX.md` 和本文件。
2. 检查 worktree，不覆盖无关用户改动。
3. 运行 Resume Notes 中的最小目标测试。
4. 从 `Next` 继续，不重新打开 Decisions 中已经确认的设计。
5. 停止时更新 Progress 与 Resume Notes。

## Resume Notes

Last updated: 2026-07-30

Done:
- 完成静态 declare Prop、defineVariants、Binding AST、validator、codegen 与 runtime 定向更新。
- `compileScenes` 和 CLI `scene validate` 都会用当前 Scene 的配对脚本 contract 校验 owner Binding。
- Editor Host 静态提取配对脚本 interface；浏览器 Authoring renderer 不导入或执行项目 TypeScript。
- Scene Instance Inspector 支持 primitive Prop 与 Variant，Binding 原始对象不作为普通字段显示。
- Binding 目标在 Inspector 显示只读解析值和语义化来源；解除后固化当前值，Undo 恢复 Binding。
- adventure-ui-demo 与中英文 authoring 文档、下游 skill reference 已迁移。

Current State:
- Editor typecheck、Editor production build 和全量 177 个测试通过。
- Editor 浏览器主包约 795 KB，整个构建约 804 KB，不包含 TypeScript compiler。
- 浏览器验收确认 Scene Instance Prop / Variant 原地更新，Binding 解除与 Undo 正常，Canvas 数量保持 1，页面无 console error。

Currently Failing:
- None。

Next:
- None。
