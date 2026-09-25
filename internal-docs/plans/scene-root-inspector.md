# Scene 根节点检查器

## Goal

Scene 根节点按 Group 节点编辑，允许在 Editor 中设置公开 Props 默认值和节点事件绑定，全部保存到 `.scene`，不修改脚本。

## Decisions

- 根属性继续保存在 `<Scene>` 普通属性中；公开 Props 的 Editor 默认值使用 `default.<prop>` 与 `default.<struct>.<field>` 属性，模型中独立保存。
- 公开 Prop 的取值顺序为实例显式传值、`.scene` Editor 默认值、脚本 `@prop` 默认值。结构化 Prop 按字段合并。
- 普通 Pixi 节点和 Scene 根的原生指针事件用 `on:<event>` 绑定当前 Scene 的 action；Scene 实例的 `@event` 对外事件语义保持不变。
- 根与普通节点共享检查器属性和节点事件编辑控件。Scene 名称保留文件身份语义。
- 默认仍手动保存，所有修改进入 SceneDocument 撤销与冲突流程。
- 根属性及公开 Prop 默认值的重复提交不产生撤销记录；未改变显示值的失焦操作保留继承默认值和重做栈。
- 字符串默认值的序列化转义覆盖所有会触发绑定解析的文本，保证保存后可以重新解析。
- 以 `0.15.0` 发布 Scene 根节点编辑、默认值、原生事件及相关修复，连同右键拖动画布功能；五个公开包按 fixed group 同步版本，通过 GitHub Actions Trusted Publishing 发布。

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
- 回归根属性、标量默认值和结构化默认值的 change / blur 重复提交、一次撤销、重做及重置。
- 回归以 `{` 开头或以 `}` 结尾的字符串默认值，包括结构化字段和带引号的合法源文件。

## Verification

- `bun run test`：26 个测试文件、352 个用例通过。
- 本次审查修复新增 10 个回归用例；修复前 8 个失败、2 个已有行为通过，修复后全部通过。
- `bun run editor:typecheck`、`bun run build`、`bun run editor:frontend:build` 通过。
- 示例项目 `bun run build:web` 通过。

## Progress

已实现根检查器、公开 Props 默认值、原生节点事件、预览与运行时优先级，并更新中英文文档和 skill 离线速查。

审查问题已修复：根属性重复提交不再影响撤销与重做，含绑定分隔符的字符串默认值可稳定往返；回归测试及完整验证已通过。

发布进行中：按 npm 发布文档生成版本和 changelog，提交后推送 tag，等待发布工作流完成并核对五个 npm 包与 GitHub Release。

## Resume Protocol

读取本计划与当前 diff，从 Resume Notes 的 Next 继续。

## Resume Notes

Last updated: 2026-09-25

Done:
- 模型、命令、解析、序列化、校验、代码生成和运行时已接通。
- Editor 根检查器、子 Scene 默认值显示和 Authoring preview 已接通。
- 相关测试、类型检查、构建已通过。
- Inspector 跳过未改变的根字段显示值，SceneDocument 拦截根属性和默认值的重复命令。
- 默认值序列化与绑定解析器的分隔符判定保持一致，覆盖标量、结构化字段及换行字符串。

Next:
- 完成 `0.15.0` 版本生成、发布和 registry 核验；更新发布状态与验证记录。
