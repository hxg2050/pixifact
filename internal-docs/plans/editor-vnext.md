# Editor vNext

状态：活跃，第一条浏览器 Editor 纵向闭环已完成
权威范围：Pixifact Editor vNext 的产品边界、用户行为、数据流和首版实现范围
上游文档：[./index.md](./index.md)、[../../AGENTS.md](../../AGENTS.md)
下游文档：后续 BDD、实现和对外 Editor 文档
更新规则：Editor vNext 的已确认边界、实现进度或验证方式变化时更新

## Goal

从零设计并实现一个由 Pixifact CLI 启动的、本地优先的浏览器 Scene 编辑器。Editor 必须完整编辑当前支持的 `.scene` 语义，并作为外部 Agent 修改项目文件时的实时可视化协作界面。

## Decisions

### 产品边界

- vNext 不以当前 Editor 的组件、布局、数据流或内部 API 为迁移基线，也不提供兼容层。
- 用户在项目目录运行 `pixifact editor`；本地 Bun 服务绑定当前项目并打开系统浏览器。
- 一个 Editor 服务只服务一个项目；不做欢迎页、项目选择器、最近项目和跨项目状态。
- 外部 Agent 是唯一 Agent 形态。Editor 不内置对话、Prompt、任务管理、Git、CI 或 Agent 编排。
- 外部 Agent 通过 Pixifact CLI 读取只读 live context，并直接修改 `.scene` 与配对脚本；Editor live bridge 不提供 mutation 入口。
- `.scene` 始终是人、Agent、Editor 和 compiler 共享的 source of truth。

### 技术栈

- 浏览器 UI 使用 Vue 3、TypeScript、Composition API 与 `<script setup>`，继续使用 Vite 构建。
- PixiJS 8 负责 Scene authoring 画布；Vue 只组合工作区 UI，不接管 Pixi DisplayObject 生命周期。
- Pinia 只保存当前 Scene、selection、左侧 Tab、面板宽度和画布视图等 UI 状态。
- `SceneDocument`、Command、compiler 集成和文件版本模型使用与 Vue 解耦的纯 TypeScript 实现。
- 本地项目服务使用 Bun，直接提供 HTTP、WebSocket、文件监听与系统程序调用，不引入额外后端框架。
- 使用 `reka-ui` 提供 Dialog、Menu、Select、Popover、Tooltip、Tabs 和 Checkbox 等无样式交互原语；层级树、Inspector 与画布工具使用 Editor 专用组件。
- 界面使用普通 CSS、CSS Variables 和 CSS Grid，图标使用 `lucide-vue-next`；不引入带完整视觉主题的 UI 组件框架。
- vNext 不保留 React 实现或兼容层；完成迁移后直接删除 React、React Aria、Zustand、Dockview React 和对应依赖。

### 编辑模型

- Editor 没有手动保存和“未保存 Scene”产品语义；有效操作提交后自动写入 `.scene`。
- Inspector 输入在编辑过程中直接更新运行时节点；失焦或 Enter 时提交一个 Scene Command 并写入文件。
- Checkbox、Select、层级操作等离散动作立即提交。
- 画布拖动和 resize 过程中直接更新运行时节点，松开时只提交一个 Command。
- Undo / Redo 只记录已提交操作，并在执行后自动写回 `.scene`。
- 外部文件变化建立新的文档基线并清空 Undo / Redo；不实现模板 Diff、自动合并或跨版本命令重放。
- 文件写入携带当前文件版本；版本不一致时明确报告同步冲突，不能静默覆盖外部修改。

### 主界面

- 固定三栏工作区：左侧 `层级 / 资产`、中央 Scene 画布、右侧 Inspector。
- 顶栏只保留返回、前进、当前 Scene、Undo、Redo 和同步状态。
- 面板可调整宽度，但不支持自由停靠、拆组和布局持久化。
- 一次只编辑一个 Scene，不做多文档 Tab；双击 Scene Instance 可进入其引用 Scene，返回时恢复上一个 Scene 的选择和画布位置。
- 第一版不做集中式问题收集或底部问题面板。当前 Scene 的解析、预览、字段和写入错误只在对应位置显示。

### 层级与资产

- 层级树编辑当前 Scene 的结构，支持选择、展开、折叠、添加、复制、删除、调整同级顺序和更换父节点。
- 同级顺序就是 `.scene` 子节点顺序；它影响普通容器绘制顺序和布局容器排列顺序。
- 拖拽必须显示明确的插入位置或目标容器，并阻止不合法的父子关系。
- 资产面板只索引项目内已有的 `.scene` 与图片，不承担通用文件管理。
- 图片由用户或外部 Agent 放入项目；Editor 不导入、复制、移动、重命名或删除图片源文件。
- 项目内图片可拖入画布或层级树，默认创建 `Image`；Scene 可拖入并创建 Scene Instance。
- 双击 Scene 打开编辑；双击图片调用系统默认程序；配对脚本通过“打开脚本”调用外部代码编辑器。
- Editor 支持在明确的现有目录中创建同名 `.scene` 与 `.ts`，第一版不支持 Scene 重命名和删除。

### 画布与 Inspector

- 画布是 Scene authoring 画布，不是完整游戏运行窗口。
- 第一版支持选择、移动、八方向 resize、平移、缩放、适应窗口、100% 和网格。
- 画布直接操作必须保持已有 frame layout 语义，不能把 layout 节点偷偷改成自由 `x / y`。
- 第一版不做多选、智能吸附、旋转控制柄、动画时间轴、游戏输入模拟和 Runtime Profiler。
- authoring 预览不触发 Scene 的游戏生命周期和交互事件。
- authoring 预览不导入或执行项目 TypeScript；Bun Host 静态提取配对脚本契约，浏览器只解释 `.scene` 与只读 interface。
- Inspector 由 Pixi 节点 schema 和 Scene interface 驱动，负责 Scene 根、节点、Scene Instance props 和 events。
- Slot 内容通过层级树编辑；Inspector 只显示 slot 名称与节点数量。
- 属性控件区分显式值与 schema 默认值；重置操作从 `.scene` 删除显式属性。
- Inspector 不显示 binding 原始数据、contract dump、compiler 调试信息和修复命令。

### 数据所有权与预览

- 本地服务只负责项目根、文件读写与版本、递归监听、图片 URL、系统程序调用和 WebSocket 通知，不执行 Scene mutation。
- `SceneDocument` 负责当前 template、文件版本、Command Stack、自动保存状态和同步状态，不放入 Pinia。
- Pinia 不保存 `.scene` template、副本或可序列化项目数据。
- `ScenePreview` 负责长驻 Pixi Application、Canvas、Scene root 和 locator 节点索引，不读取或写入项目文件。
- UI 只能向 `SceneDocument` 提交明确 Command，不能通过替换整个 template 驱动 Preview 生命周期。
- 普通属性 Command 原地更新 locator 对应的运行时节点，不重建 Scene。
- 本地结构变化和外部文件变化在画布外准备新 Scene root，完成后原子替换；Pixi Application、Canvas、缩放和画布位置保持不变。

### 视觉方向

- 使用固定、扁平、紧凑的中性深色工具界面；中央画布是视觉中心。
- 不使用浮动卡片、渐变背景、装饰图形和厚重阴影。
- 面板以细分隔线组织；蓝色用于选择与焦点，绿色用于已同步，黄色用于写入或外部变化，红色用于失败。
- 第一版只提供这一套主题，不做主题切换。

## Non-Goals

- Tauri、Rust desktop host、桌面安装包和 WebView 专用桥接。
- Dockview、自由工作台、多 Scene Tab 和独立 Project Preview。
- 图片导入或源资源编辑。
- 完整游戏运行、进程管理、stdout / stderr、运行日志和自动打开游戏 URL。
- 集中式问题收集、项目级诊断面板和 Runtime Profiler。
- 内嵌代码编辑器、Agent UI、Git、CI、发布和项目管理。
- 为当前 Editor 的路径、协议、状态或 UI 提供兼容层。

## Public API / User-Facing Behavior

- 新增 `pixifact editor`，从当前项目目录启动本地服务并打开浏览器 Editor。
- Editor 直接进入项目工作区，一次只打开一个 Scene。
- `.scene` 编辑自动保存；顶栏显示 `已同步`、`正在写入`、`外部变更已应用`、`同步冲突` 或 `写入失败`。
- 外部 Agent 继续通过直接文件编辑与现有 Pixifact CLI 工作，不依赖 Editor mutation API。
- 当前 `bun run desktop`、Tauri 配置和桌面运行能力在 vNext 完成时直接删除，不保留别名或 fallback。

## Implementation Scope

- 在 `packages/pixifact-cli/` 增加 Editor 启动入口与本地项目服务。
- 用 Bun / Node 标准能力实现受项目根约束的文件读写、版本检查、监听、图片访问、系统程序调用和 WebSocket 通知。
- 用 Vue 3、TypeScript、Vite、Pinia 和 Reka UI 重建 `apps/editor/` 浏览器 UI，并实现 SceneDocument、Command 流程和长驻 ScenePreview。
- 建立固定三栏、单 Scene 导航、层级、只读资产索引、画布和 schema-driven Inspector。
- 接通自动保存、Undo / Redo、外部变化同步和只读 live context。
- vNext 完成后删除 Tauri host、Dockview、React、Zustand、旧运行服务和不再使用的旧 Editor 实现及依赖。
- 实现完成后更新 README、中文与英文 Editor 对外文档和相关脚本。

## Test Plan

- [ ] 为 `pixifact editor` 启动、项目根绑定、本机地址限制和会话发现补 CLI / 服务测试。
- [ ] 为受项目根约束的文件读取、版本写入、文件监听和图片访问补服务测试。
- [x] 为 SceneDocument Command、Undo / Redo、自动保存和同步冲突补单元测试。
- [x] 为普通属性增量更新、结构变化替换 Scene root 补 Preview Command 分类测试，并完成人工 Canvas 长驻验收。
- [ ] 使用 Vitest 与 Vue Test Utils 为固定三栏、单 Scene 导航、层级、资产、画布和 Inspector 补 UI 测试；当前已覆盖 Pinia 边界、层级结构操作与 Inspector preview / commit。
- [ ] 为外部 `.scene` / 脚本 / 图片变化和只读 live context 补集成测试。
- [ ] 在桌面浏览器视口完成布局、无重叠、拖拽与 Inspector 实时反馈的人工验证；当前已完成固定三栏、Canvas 非空、属性实时反馈、层级添加、自动保存和 Undo 验收。

## Verification

```bash
rtk bun run editor:typecheck
rtk bun run editor:frontend:build
rtk bun run test
rtk bun run pixifact -- editor
```

最后一条命令在 `pixifact editor` 实现后用于人工验证启动、浏览器连接和当前项目绑定。

## Progress

- [x] 确认产品边界、核心工作流和数据所有权。
- [x] 确认固定三栏与中性深色视觉方向，并完成临时 HTML 验证稿。
- [x] 将首版用户行为写入 BDD。
- [x] 实现本地项目服务与 `pixifact editor` 第一条启动 / 读写闭环。
- [x] 实现 SceneDocument、自动保存、Undo / Redo、版本冲突和文件通知协调。
- [x] 实现长驻 ScenePreview 与普通属性增量更新。
- [x] 实现新版固定三栏 UI 的首个可用版本。
- [x] 删除旧 Tauri / Dockview / 运行服务并迁移对外文档。
- [x] 实现层级结构添加、复制、删除、同级排序和更换父节点。
- [x] 实现画布节点选择、连续移动与八方向 resize，并保持 frame layout 约束和栈布局所有权。

## Resume Protocol

1. 阅读 `AGENTS.md`、`CODEX.md` 和本文件。
2. 检查 worktree，不覆盖无关用户改动。
3. 阅读 [Testing](../testing/TESTING.md) 并从第一个未完成 Progress 项开始。
4. 先补对应 BDD / 失败测试，再实现目标行为。
5. 运行最小相关验证；停止时更新本文件的 Progress 和 Resume Notes。

## Resume Notes

Last updated: 2026-07-31

Done:
- 完成 `pixifact editor` 本地 Bun 服务、127.0.0.1 绑定、系统浏览器启动、项目索引、受 project root 约束的文件读取和 versioned Scene write。
- 完成 Vue 3 + Pinia + Reka UI 固定三栏，打开第一个 `.scene` 后展示层级、长驻 Pixi Canvas 和 schema-driven Inspector。
- 完成 `SceneDocument` 的属性 preview、Command commit、自动保存、Undo / Redo、同步状态和 409 冲突。
- 文件通知会等待保存队列稳定并比较文件版本，自身写入不会重建文档；外部版本建立新的文档基线。
- Inspector 输入原地更新运行时节点，失焦或 Enter 后保存；提交后的 draft 不再被旧 revision 回跳。
- 浏览器验收完成 `120 -> 130 -> Undo 120 -> 恢复 54`，全过程 Canvas 数量为 1，sample Scene 最终无 diff。
- 新增 Editor server、SceneDocument 和 Vue Inspector / Pinia 回归测试。
- 完全删除旧 Tauri host、React / React Aria / Dockview / Zustand UI、运行服务、旧 live bridge、对应测试和依赖。
- runtime preview 与 Scene binding 已迁移到浏览器 `/api/file`，不再依赖旧 host bridge 或 document controller。
- 配对脚本 contract extraction 已迁到 Bun Host 的 `/api/scene-bindings`；浏览器包不含 TypeScript compiler，也不执行项目脚本。
- Scene Instance primitive Props 与 Variant 已接入 Inspector，连续修改通过生成访问器原地更新内部 Binding。
- 层级已接通 Compiler `insertNode`、`deleteNode` 和 `moveNode` Command，支持添加、复制、删除、同级排序和更换父节点。
- 层级拖拽从节点整行启动并使用 Pointer Events，不依赖浏览器原生 Drag and Drop。
- 画布直接操作使用长驻 Pixi authoring preview 的 Pointer Events；移动和 resize 期间只 preview，释放后提交一个 Scene Command。
- 画布不会把 frame layout 转换成自由 `x / y`；`HBoxContainer`、`VBoxContainer` 和 `GridContainer` 的直接子节点不能自由移动，但可通过右、下、右下控制点修改 `width / height`。
- 新建节点写入 schema defaults，复制子树递归生成全 Scene 唯一 ID；每个结构操作自动保存并可 Undo / Redo。
- Compiler `moveNode` 已覆盖同级首尾边界，并能通过 inverse 精确恢复原顺序。
- 结构 Command、Undo 和 Redo 只重建 Scene preview root；桌面浏览器验收中 Canvas 始终只有一个，临时添加节点经 Undo 后示例 Scene 无 diff。

Current State:
- 第一条纵向闭环可从 CLI 启动并在浏览器中使用。
- 仓库只保留 Vue 浏览器 Editor，不存在旧桌面入口或兼容层。
- vNext 尚未实现完整资产拖入交互和 read-only live context。
- 当前浏览器主包约 812 KB，整个 Editor 构建约 821 KB；TypeScript compiler 只存在于 Node/Bun extractor，不进入浏览器包。
- 层级结构编辑直接复用 Compiler Command，不存在第二套树 mutation 模型。

Currently Failing:
- None。

Next:
1. 补齐图片拖入画布或层级创建 `Image`、Scene 拖入创建 Scene Instance 的资产交互。
2. 重新接通 read-only live context。
