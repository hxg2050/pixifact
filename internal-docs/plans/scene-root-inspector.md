# Scene 根节点检查器

## Goal

Scene 根节点按 Group 节点编辑，允许在 Editor 中设置公开 Props 默认值和节点事件绑定，全部保存到 `.scene`，不修改脚本。

## Decisions

- 根属性继续保存在 `<Scene>` 普通属性中；公开 Props 的 Editor 默认值使用 `default.<prop>` 与 `default.<struct>.<field>` 属性，模型中独立保存。
- 公开 Prop 的取值顺序为实例显式传值、`.scene` Editor 默认值、脚本 `@prop` 默认值。结构化 Prop 按字段合并。
- 普通 Pixi 节点和 Scene 根的原生指针事件用 `on:<event>` 绑定当前 Scene 的 action；Scene 实例的 `@event` 对外事件语义保持不变。
- 根与普通节点共享检查器属性和节点事件编辑控件。Scene 名称保留文件身份语义。
- 默认仍手动保存，所有修改进入 SceneDocument 撤销与冲突流程。

## Non-Goals

- 不编辑 `.ts`、不创建公开 Props、不开通任意脚本编辑。
- 不改变 Scene 实例现有 `@event` 的含义。

## Public API / User-Facing Behavior

- 选中 Scene 根时可修改 Group 属性、公开 Props 默认值、原生节点事件绑定。
- 清除 Editor 默认值后使用脚本默认值；实例显式传值始终优先。

## Implementation Scope

- `.scene` 模型、解析、序列化、校验、命令和编译器。
- Scene runtime 默认值初始化和节点事件连接。
- Editor 预览、根节点检查器、事件编辑与相关文档。

## Test Plan

- 先验证 `.scene` 默认值及事件的解析、序列化与命令撤销。
- 验证脚本/Editor/实例三层优先级、结构化字段合并、根和普通节点事件。
- 运行相关 Vitest、Editor 类型检查和构建。

## Verification

- `bun run test`：26 个测试文件、342 个用例通过。
- 新增测试后，相关 Scene compiler、Editor UI、Authoring preview 测试 132 个用例通过。
- `bun run editor:typecheck`、`bun run build`、`bun run editor:frontend:build` 通过。
- 示例项目 `bun run build:web` 通过。

## Progress

已实现根检查器、公开 Props 默认值、原生节点事件、预览与运行时优先级，并更新中英文文档和 skill 离线速查。

## Resume Protocol

读取本计划与当前 diff，从 Resume Notes 的 Next 继续。

## Resume Notes

Last updated: 2026-09-25

Done:
- 模型、命令、解析、序列化、校验、代码生成和运行时已接通。
- Editor 根检查器、子 Scene 默认值显示和 Authoring preview 已接通。
- 相关测试、类型检查、构建已通过。

Next:
- 无。
