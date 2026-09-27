# Editor UI 优化

## Goal

让多 Scene Editor 的文件定位、节点查找、画布视图和属性编辑更清晰，并给画布留出可调空间。

## Decisions

- Scene 标签是当前文件的唯一身份入口；顶栏显示项目和导航、编辑、保存状态。
- 项目公共资产从顶栏下方延伸到底部，与底部设置同属最左侧面板；Scene 标签只出现在其右侧，不随 Scene 切换。当前 Scene 层级独立居于资产与画布之间，在同一行提供搜索、按类型分组的新增菜单、复制和删除；搜索不修改 Scene 数据。
- 资产、层级和 Inspector 面板可调整宽度和收起，画布始终是中间主区域。
- 画布工具仍是平移、移动、调整大小；视图角落显示缩放比例和设计尺寸。
- Inspector 默认突出节点身份、变换、布局及节点属性；低频显示/交互属性可折叠；布局接管变换时给出明确说明。
- Editor 使用 macOS 风格的系统字体、面板层次和控件状态；外观可选跟随系统、浅色或深色，默认深色，跟随系统时响应系统外观变化。浏览器窗口控件由浏览器自身提供。
- 外观偏好与自动保存共用当前项目的 Editor UI 状态文件；读取无外观字段的已有状态时视为深色，已有明确主题选择保持不变。
- 资产和层级列表行高均为 28px，行间距为 0。
- 检查器节点头部、分组标题、字段行和输入控件轻微收紧；字段行保持 36px 的最小高度，输入控件高 27px。
- 按用户指定参考 Egret UI Editor：快捷约束图标 + 父子容器示意图，顶部三开关对应左 / 水平中心 / 右，左侧三开关对应上 / 垂直中心 / 下；数值分别放在底部和右侧。
- 按紧凑排版反馈收紧布局区：约束图高 90px，快捷按钮和输入框高 24px，区域边距 6px / 12px；保留字号，解除绑定按钮放入输入框内，避免挤占相邻行。
- 勾选按当前预览几何计算偏移，取消最后一个同轴约束时固化位置，解除拉伸时固化尺寸。快捷图标以 0 设置目标约束并清除其他同轴值；全部更新进入单个 batch，支持多选和撤销。
- 数值使用中文可访问名称、未设置 / 混合值占位，被边距覆盖的中心偏移给出提示；清空移除约束。绑定字段保持只读，相关轴禁用操作；没有可用预览或节点受排列布局接管时不启用复选框。
- 只从 SceneCanvas 读取当前节点及父容器几何，通过 EditorApp 传给 Inspector，不把预览几何存成项目数据。
- 移除布局约束时重建预览，恢复源码中的位置和自然尺寸，避免撤销居中或拉伸后画布保留旧几何。
- 参考来源：[Egret ConstraintDetailPart](https://github.com/egret-labs/egret-ui-editor-opensource/blob/master/src/egret/workbench/parts/properties/electron-browser/views/property-sizepos/parts/constraintDetailPart.ts) 与同目录 ConstraintFastPart。

## Non-Goals

- 不改变 `.scene` 格式、编辑命令、保存和冲突协议。
- 不引入新的 UI 依赖、内嵌代码编辑器或新的 Agent 工作流。

## Public API / User-Facing Behavior

无公开 API 变化。项目资产常驻，用户可搜索当前 Scene 层级、分类新增节点、调整/收起侧栏，并在画布与 Inspector 直接读到视图和布局状态。设置中可即时切换外观，刷新或重启后保留偏好。

## Implementation Scope

- `apps/editor/src/EditorApp.vue`：顶栏信息层次和侧栏交互。
- `apps/editor/src/panels/HierarchyPanel.vue`、`components/HierarchyNode.vue`：搜索与新增菜单。
- `apps/editor/src/panels/InspectorPanel.vue`：身份信息、约束图与快捷操作、布局提示和分组折叠。
- `apps/editor/src/preview/SceneCanvas.vue`、`sceneCanvasGeometry.ts`、`scenePreviewCommands.ts`：视图信息、供 Inspector 读取的几何和移除约束后的预览恢复。
- `apps/editor/src/styles.css`：尺寸、间距、焦点和响应式布局。
- `apps/editor/src/stores/editorUi.ts`：删除不再需要的左栏切换状态。
- 更新相关 UI 测试中已改变的操作入口。
- `apps/editor/src/services/editorApi.ts`、`packages/pixifact-cli/src/editorServer.ts`：保存并校验外观偏好。

## Test Plan

布局操作优化：覆盖快捷约束、勾选保持位置、解除拉伸保持尺寸、单步 Undo / Redo、数值清空、多选混合状态、根属性同步和绑定保护。运行相关 Vue UI / document 测试、类型检查、前端构建，并在示例 Editor 验收。

先按用户原先要求交付供手动验收。用户随后允许自行检查，已运行 Editor 类型检查、相关 UI 测试和前端构建，并在浏览器检查浅色、深色及较窄有效视口。

新增主题设置先以服务端和 UI 测试确认默认值、已有设置读取、手动切换与持久化，再运行 Editor 类型检查和前端构建；浏览器中确认设置菜单、深色外观与刷新后选中状态。

## Verification

`bun run editor:typecheck` 通过；`tests/editor-vue-ui.test.ts` 的 32 项测试通过；`bun run editor:frontend:build` 通过。浏览器中检查了浅色、深色、设置弹出层、新增菜单和较窄有效视口，主题文字、输入框、选中态及提示均可读。移动设备尺寸不在本次桌面 Editor 主题改造范围内。

主题切换的服务端与 UI 测试通过；Chrome 支持 `light-dark()`。实机确认默认跟随系统、切换深色后整页配色变化、刷新后保留深色，再恢复跟随系统。

最新一次默认深色和列表密度调整按用户要求交由其手动检查；只构建前端供验收，未运行自动测试或视觉检查。

2026-09-27 布局操作优化：`editor-vue-ui`、`editor-scene-document`、`editor-scene-canvas`、`project-file-tree` 共 83 项测试通过；`bun run editor:typecheck`、`bun run editor:frontend:build`、`git diff --check` 通过。构建保留现有大 chunk 提示。Chrome 实机验证左边距按当前位置填入 56、右边距计算为 384、解除拉伸保留宽度 310、水平居中及撤销还原画布位置。示例恢复已同步，布局面板展开供用户试用。

后续紧凑排版仅修改 CSS：布局内容区高度减少约 26%，前端构建及 `git diff --check` 通过；Chrome 实机确认图标、约束开关、数值框及提示均完整显示，无重叠。未重复运行交互测试。

## Progress

原 UI 优化和新增主题切换均已实现并自行检查。

2026-09-27：Egret 风格布局操作及移除约束后的预览恢复已完成，通过相关回归和实机验收。
按后续反馈完成布局区紧凑排版，并更新运行中的示例。

## Resume Protocol

先读本计划和当前 Git diff，再从 Resume Notes 的下一步继续；保留无关未跟踪文件。

## Resume Notes

Last updated: 2026-09-27

Done:
- 确定 UI 优化范围和手动验收方式。
- 顶栏、可调侧栏、层级搜索与分类新增、画布信息、Inspector 分组与布局提示已实现。
- 按手动反馈把层级搜索和新增、复制、删除合并为同一行。
- 按手动反馈把项目资产与设置合并为常驻最左侧面板，层级独立成栏，删除面板切换状态。
- 按手动反馈让资产栏跨越 Scene 标签行，顶栏以下整列占满。
- 按手动反馈统一为 macOS 风格界面，并适配系统浅色与深色外观。
- 同步调整了现有层级 UI 测试的操作入口和 README 说明。
- 设置中加入跟随系统、浅色、深色选项，按项目保存并允许手动覆盖系统外观。
- 按最新反馈把默认外观改为深色，将资产与层级列表项收紧到 28px 且无行间空隙。
- 按最新反馈收紧检查器头部、分组标题与属性行的垂直密度。
- 参考 Egret 官方实现约束图、贴边 / 居中 / 铺满图标、保持几何的勾选操作、多选批处理及绑定保护。
- 补充布局操作测试；修复移除约束后画布仍保留布局位置的问题。
- 收紧布局区示意图、控件高度和间距，保持原字号与交互。

Current State:
- 布局功能及预览恢复修复已完成，83 项相关测试、类型检查、构建和浏览器验收通过。
- 后续紧凑样式已完成，构建和浏览器视觉检查通过。
- `star-game-demo` Editor 运行于 `http://127.0.0.1:57809`，场景保持已同步，未保存验收用临时修改。

Next:
1. 本轮实现完成，示例 Editor 保持运行，后续按用户实际操作反馈继续优化。
