# Editor vNext

后续已实施的 [手动保存](./editor-manual-save.md) 与 [多 Scene 标签](./editor-multi-scene-tabs.md) 决策覆盖下文的首版单 Scene、自动保存约束；下方进度记录保留当时的实现历史。

## 2026-11-07：第三方依赖升级

Goal：将构建、Editor、渲染、测试和发布工具升级到当前版本，保留刚完成的 TypeScript / Vue mapper 路线，完成实际三端与仓库外安装验收。

Decisions：固定 TypeScript 7.1.0-beta 和 Vue content mapper 4.0.0-alpha.3；分批升级 Vite 8.3.6、Vue 3.5.45、Pinia 4.1.0、Reka 2.11.0、Playwright 1.65.0 等 Editor / 构建依赖，PixiJS 8.22.0 与 Three r187，再迁移 Vitest 5.1.0、Happy DOM 21.0.4、magic-string 1.4.5、Changesets 3.0.3。仓库、模板和 CI 的 Bun 对齐 1.4.4，Node 类型对齐 CI 的 Node 24；本机验证使用已安装的 Node 24.21.0。所有调用方直接迁移，不新增旧版本兼容层或 fallback。

Non-Goals：更改 Scene 格式、添加产品功能、调整 TS / mapper 的预发布版本、发布 npm 包或创建 release tag。

Public API / User-Facing Behavior：生成项目使用新版依赖；Three 插件要求 r187。现有 Scene、Editor、分包、资源加载和 Web / 微信 / 抖音出包行为由回归验收保持。

Implementation Scope：依赖声明与锁文件、脚手架及示例、CI / 工具链说明、新依赖引起的必要 API 迁移及既有测试中的真实回归覆盖。Vite 配置直接使用 rolldownOptions 和 Rolldown 类型，移除旧 Rollup 别名；在新版 Rolldown 下取消旧的 inlineConst: false 绕行设置，明确 Vite peer 为 >=8.3.6 <9。

Test Plan：以 b0fa7da 已通过的 32 文件 / 452 项和完整 release:check 为基线；分批执行最小 Editor / CLI / 渲染 / 分包检查，记录实际失败再迁移。验证真实 Chrome 中 2D / 3D 合成、截图、原生 TS 与 Vue 类型检查、三端构建、sourcemap、Changesets 只读状态、六包内容、仓库外模板和安装矩阵。最终执行 frozen-lockfile、完整 release:check、diff 检查并仅提交本轮 tracked 文件。

Verification：升级前工作区干净；已核对 npm 官方版本及 Vitest / Three / Changesets 迁移资料。基线验证复用上一节最终验收。第一批 Editor 类型检查、前端构建和 3 文件 / 141 项通过。渲染升级后分包 VM 测试 4 项 Red：合成 fixture 缺少显式 experimentalDecorators，产物保留了未转换的 @scene()；fixture 对齐实际项目配置后，平台 / Three 8 文件 / 39 项和 runtime 构建通过。真实 Chrome 156 在 2 倍像素比下完成 3D + UI 合成、UI 点击屏蔽世界拾取、拖动相机、模型拾取、800×600 / 640×480 resize 和 CLI 合成截图，页面错误为零。测试工具升级后首次全量 31 文件 / 355 项通过，Scene compiler suite 因装饰器未转换而失败；测试执行器显式指定既有 TypeScript 装饰器语义后，该文件 97 项通过。

Progress：
- [x] 核对规范、依赖目标、官方迁移说明和环境。
- [x] 构建 / Editor 依赖与 Bun / Node 类型升级及验证。
- [x] 渲染依赖升级、实际 WebGL 与三端验收。
- [x] 测试 / 发布工具升级、全量验证、文档与提交。

Resume Protocol：先读本节、检查 git status；从 Resume Notes 的最小失败项继续。

Resume Notes：
- Done：依赖与锁文件、模板 / 示例、Bun / CI、Three 版本约束和原生 WeakRef / FinalizationRegistry 要求已同步；141 项 Editor / CLI、39 项平台 / Three、97 项 Scene 和真实 Chrome 合成验收通过。
- Current State：两轮完整 release:check 均通过 32 文件 / 452 项、Editor 类型检查、全部构建、六包内容、仓库外两个模板和 Web / 微信 / 抖音的 2D / Three 安装矩阵；最终一轮包含 Rolldown API 迁移和取消旧 inlineConst 设置。Changesets 3 在带 Bun lockfile 的隔离 workspace 中验证六包统一升版与模板同步通过；无 changeset 的 version 明确退出 1，本仓库未升版。三个示例原生 TS 类型检查、最终 frozen-lockfile、真实 Scene 截图和 diff 检查通过。工作区仅含本轮 tracked 变动并随本节提交；小游戏真机 GPU 与其 JS 引擎能力仍需设备验收，不能由构建 / VM / Chrome 测试替代。
- Next：本轮升级完成，未创建 release tag 或发布 npm；后续发布按独立任务执行。

## 2026-11-07：TypeScript 7.1 与 Vue content mapper

Goal：框架、CLI、示例与脚手架直接使用 TypeScript 7.1 官方 API，Editor 使用 Vue content mapper 类型检查。

Decisions：用户已选择不使用桥接；固定 `typescript@7.1.0-beta` 和 `@vue/content-mapper@4.0.0-alpha.3`，删除旧 Compiler API、vue-tsc、旧 Rollup TypeScript 构建入口及其专用依赖。保留 Scene 契约与代码分包语义；契约提取改用官方异步 API，并迁移所有调用方（同步 API 在 Bun 中访问 stdout._handle.fd 失败，异步 API 已实测通过）。不引入旧 TypeScript 别名、兼容层或 fallback。契约提取使用新官方 AST API；分包使用 Vite 自带 AST 与现有 magic-string 生成映射，避免重新打印源码导致映射偏移。预发布版本状态在维护文档中明确记录。

Non-Goals：其他第三方库的批量升级、改变 Scene 格式或游戏运行时语义、自动发布新版本。

Public API / User-Facing Behavior：契约提取与内置契约读取 API 改为 Promise，所有调用方直接 await；Scene inspect / validate / compile、Editor 和三端出包保持现有行为；`editor:typecheck` 改为 `tsc --runExternalCode --noEmit`。

Implementation Scope：Scene script extractor、Vite 分包转换、生成模块测试、依赖与锁文件、各 tsconfig、脚手架模板、CI 与相关维护文档。

Test Plan：先跑 Scene 接口和分包既有测试基线，切换依赖后记录失败；迁移后验证契约提取、生成模块执行、真实 Web / 微信 / 抖音构建及 sourcemap。Editor 同时验证正确 Vue 组件通过、错误模板属性被拒绝和真实 Editor 类型检查；随后全量测试、runtime / frontend / scaffold 构建、六包内容与仓库外安装验收。检查锁文件无旧 TS / bridge，工作区只提交本轮 tracked 变动。

Verification：基线 Scene 接口与分包测试 2 文件 / 31 项通过；换依赖后既有测试 27 项 Red，迁移后恢复通过。Node / Bun 1.3.13 异步 API 探针、Vue CLI 正反例、变量捕获与 sourcemap 精确行列回归通过。第一轮完整 release:check 通过 32 文件 / 452 项、Editor 类型检查、全部构建、六包内容与仓库外安装；两个生成模板及 2D / Three 示例也经过原生 tsc。最终审查补充无插值模板字符串 import() 回归，在微信 / 抖音各复现 1 项 Red；已保留该静态导入语义。修复后相关平台 / Three 测试 2 文件 / 17 项通过，最终完整 release:check 再次通过 32 文件 / 452 项、Editor 类型检查、全部构建、六包内容、仓库外 Web / 微信 / 抖音 / Three 安装、两个生成模板类型检查与构建；bun install --frozen-lockfile 和 git diff --check 通过。

Progress：
- [x] 读取规范与依赖、确认官方新路线和用户授权范围。
- [x] 核对 API、测试基线并记录 Red。
- [x] 迁移实现、配置、依赖与测试。
- [x] 完成最小及全量验证、文档和提交。

Resume Protocol：先读本节、检查 git status 和下列 Resume Notes，继续最小失败项。

Resume Notes：
- Done：官方异步 API、Vite 原生 AST 分包与源码映射、Vue content mapper、Reka as-child 原生属性、依赖 / 锁文件、模板 / 示例、CI 与维护说明均完成；原生 Vue 错误定位、变量捕获、模板字符串导入和源码行列映射有持续回归覆盖。最终 452 项及完整 release:check 通过，三个仓库内示例原生类型检查通过。
- Current State：已完成并随本节提交，工作区只纳入本轮 tracked 变动。最初一次 Bun help 子进程内存分配 stderr 在独立 CLI 65 项和两轮完整 452 项复测中均未重现；截图命令异步等待与模板字符串导入遗漏均已修复。工具链使用明确固定的 Beta / Alpha 版本，本轮不发布 npm 版本。
- Next：本轮无剩余工作；后续发布按单独的版本发布任务执行。

## 2026-11-07：图片资源双击系统打开

Goal：补齐现有资产面板的图片双击行为，通过本机系统默认程序打开原始文件。

用户追加要求：完成后发布更新；本次按固定六包发布 `0.20.1`，由 tag workflow 完成发布检查并验证 Three 的首次 OIDC 发布。

Decisions：保留 Scene 双击在 Editor 中编辑、图片单击预览和 Pointer 拖拽；不扩大资产面板的文件类型。浏览器通过同源 POST 请求本地服务，复用项目根路径校验，服务仅接受现有文件；使用 Node 标准库和系统原生打开命令，不引入依赖。打开失败在现有错误区域显示，不改变 Scene 文档和选区。

Non-Goals：新增资源类型浏览、内嵌源资源编辑器、文件管理和默认程序配置。

Public API / User-Facing Behavior：图片双击调用系统默认程序；内部新增 `POST /api/open-file?path=<项目相对路径>`。

Implementation Scope：AssetsPanel、Editor API、EditorApp 和本地服务；补充既有 UI / 服务测试和 CLI README。

Test Plan：先验证双击请求链路和失败提示；服务覆盖默认程序委派、含空格及中文路径、同源限制、项目根 / 符号链接边界、目录拒绝、文件删除和启动失败。运行相关测试、Editor 类型检查及构建，并在 macOS 浏览器验证实际系统打开。

Verification：新增测试先以 9 项失败复现入口缺失；实现后相关 82 项测试通过，全量 32 个文件 / 451 项测试通过，`editor:typecheck`、`editor:frontend:build` 和 `git diff --check` 通过。服务测试使用 Node Request；通知合并测试改在可控事件边界验证，保留实际目录监听集成覆盖，避免依赖 macOS 原生事件批次。macOS Chrome 实测单击图片预览、双击一次 POST、系统“预览”显示含中文 / 空格 / 特殊字符的原始图片；源文件、当前 Scene、选区和单 Canvas 保持，删除图片后返回 404 并显示原因，浏览器无异常。Windows / Linux 的委派参数已自动测试，尚无实机验收。浏览器记录位于 `/tmp/pixifact-system-open-browser.json`。

发布验证：[v0.20.1 发布 CI](https://github.com/hxg2050/pixifact/actions/runs/42260513202) 通过 32 个文件 / 451 项测试、全部构建、六包内容和仓库外安装验收。六包通过 Trusted Publishing 发布，npm registry 的目标版本和 `latest` 均为 `0.20.1`；Three 首次 OIDC 发布成功并生成 provenance。[GitHub Release](https://github.com/hxg2050/pixifact/releases/tag/v0.20.1) 已发布。

Progress：
- [x] 检查当前 UI、项目服务、BDD 和既有计划，确认图片双击入口缺失。
- [x] 补充失败测试，实现并验证系统打开。
- [x] 发布 `0.20.1`，核对六包 registry、发布 CI 和 Three 首次 OIDC 验证。

Resume Notes：
- Done：系统打开、错误反馈、路径边界、UI 回归、类型检查、构建和 macOS 实际窗口验收完成；全量 451 项通过，六包 `0.20.1` 已发布。
- Current State：功能提交 `262a9aa`；版本提交 `5deb12a` 与 tag `v0.20.1` 已推送，发布 CI、六包 npm / latest、GitHub Release 和 Three 首次 OIDC 验证完成。
- Next：本轮无剩余工作；按后续用户需求继续。

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
- 外部 Agent 直接修改 `.scene` 与配对脚本，并通过 `pixifact editor context` 读取只读 Editor 状态；context 不提供 mutation 入口，也不恢复旧 `live ...` CLI 或固定端口 bridge。
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
- 顶栏只保留返回、前进、当前 Scene、刷新、Undo、Redo 和同步状态。
- 面板可调整宽度，但不支持自由停靠、拆组和布局持久化。
- 一次只编辑一个 Scene，不做多文档 Tab；双击 Scene Instance 可进入其引用 Scene，返回时恢复上一个 Scene 的选择和画布位置。
- 同一项目允许打开多个浏览器标签页，但同时只有一个活动编辑标签页；standby 标签页可显式接管，原活动标签页随即失活。
- 接管恢复最新同步 context 中的 Scene 和 selection，不迁移 Undo / Redo 与画布视图；活动 Scene 未同步时拒绝接管。
- 第一版不做集中式问题收集或底部问题面板。当前 Scene 的解析、预览、字段和写入错误只在对应位置显示。

### 层级与资产

- 层级树编辑当前 Scene 的结构，支持选择、展开、折叠、添加、复制、删除、调整同级顺序和更换父节点。
- 同级顺序就是 `.scene` 子节点顺序；它影响普通容器绘制顺序和布局容器排列顺序。
- 拖拽必须显示明确的插入位置或目标容器，并阻止不合法的父子关系。
- 资产面板只索引项目内已有的 `.scene` 与图片，不承担通用文件管理。
- 图片由用户或外部 Agent 放入项目；Editor 不导入、复制、移动、重命名或删除图片源文件。
- 项目内图片可拖入画布或层级树，默认创建 `Image`；Scene 可拖入并创建 Scene Instance。
- 资产投放只消费项目索引中的现有文件；画布投放创建根级节点并写入 Scene 坐标，层级投放复用 before / inside / after 插入位置；当前 Scene 不允许拖入自身。
- 双击 Scene 打开编辑；双击图片调用系统默认程序；配对脚本通过“打开脚本”调用外部代码编辑器。
- Editor 支持在明确的现有目录中创建同名 `.scene` 与 `.ts`，第一版不支持 Scene 重命名和删除。

### 画布与 Inspector

- 画布是 Scene authoring 画布，不是完整游戏运行窗口。
- 第一版支持选择、移动、八方向 resize、平移、缩放、适应窗口、100% 和网格。
- 画布视图是 Editor UI 状态；同一路径 Scene 重建保持视图，切换 Scene 时重新适应，画布尺寸变化时保持中心 Scene 坐标。
- 平移使用 `Space + 左键拖动`或中键拖动；“适应窗口”将完整 Scene 居中且不放大到 100% 以上。
- 画布直接操作必须保持已有 frame layout 语义，不能把 layout 节点偷偷改成自由 `x / y`。
- 第一版不做多选、智能吸附、旋转控制柄、动画时间轴、游戏输入模拟和 Runtime Profiler。
- authoring 预览不触发 Scene 的游戏生命周期和交互事件。
- authoring 预览不导入或执行项目 TypeScript；Bun Host 静态提取配对脚本契约，浏览器只解释 `.scene` 与只读 interface。
- Inspector 由 Pixi 节点 schema 和 Scene interface 驱动，负责 Scene 根、节点、Scene Instance props 和 events。
- Inspector 的“节点”区域提供可编辑的稳定 `id`；失焦或 Enter 提交 `setNodeId`，空值和重复 ID 拒绝，成功后选区跟随新的 locator 并支持 Undo / Redo；不自动修改配对脚本的 `@part` 契约。
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
- 外部文件通知继续使用一条按路径合并的刷新管线；当前 Scene、其他 Scene、配对脚本和图片按类型刷新，不增加独立 watcher。
- 首版不建立 Scene / 图片依赖图；任意非当前 Scene 或图片变化都重建当前 Preview，连续通知只允许最新 generation 应用结果。
- `editor screenshot` 复用当前活动浏览器中的 Authoring Preview，不在 CLI 或 Host 引入第二套 Pixi renderer、Playwright 或 Chromium。
- 截图只接受当前已同步、磁盘 revision 一致且 preview ready 的 Scene；不切换 Scene、不修改项目，也不执行项目 TypeScript 或 runtime 逻辑。
- 截图固定使用 Scene 设计尺寸并只捕获 Preview root，不受画布 zoom / pan 影响，也不包含选择框和 Editor UI。

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
- 新增 `pixifact editor context`，从当前项目已注册的 Editor Host 读取 Scene revision、同步状态和 selection。
- 新增 `pixifact editor screenshot --output <png-path>`，将当前同步的 Authoring Scene 以设计尺寸 PNG 写入指定路径。
- Editor 直接进入项目工作区，一次只打开一个 Scene。
- `.scene` 编辑自动保存；顶栏显示 `已同步`、`正在写入`、`外部变更已应用`、`同步冲突` 或 `写入失败`。
- 顶栏刷新按钮重新读取项目索引、Scene interface 和当前 Scene；同 revision 保留选择与 Undo / Redo，变化的 revision 建立新基线。
- 外部 Agent 继续通过直接文件编辑与现有 Pixifact CLI 工作，不依赖 Editor mutation API。
- 当前 `bun run desktop`、Tauri 配置和桌面运行能力在 vNext 完成时直接删除，不保留别名或 fallback。

## Implementation Scope

- 在 `packages/pixifact-cli/` 增加 Editor 启动入口与本地项目服务。
- 用 Bun / Node 标准能力实现受项目根约束的文件读写、版本检查、监听、图片访问、系统程序调用和 WebSocket 通知。
- 用 Vue 3、TypeScript、Vite、Pinia 和 Reka UI 重建 `apps/editor/` 浏览器 UI，并实现 SceneDocument、Command 流程和长驻 ScenePreview。
- 建立固定三栏、单 Scene 导航、层级、只读资产索引、画布和 schema-driven Inspector。
- 接通自动保存、Undo / Redo、外部变化同步和只读 Editor context。
- 通过现有 Editor Host session 协议接通当前 Authoring Scene 的只读截图，不增加独立渲染进程。
- vNext 完成后删除 Tauri host、Dockview、React、Zustand、旧运行服务和不再使用的旧 Editor 实现及依赖。
- 实现完成后更新 README、中文与英文 Editor 对外文档和相关脚本。

## Test Plan

- [ ] 为 `pixifact editor` 启动、项目根绑定、本机地址限制和会话发现补 CLI / 服务测试。
- [x] 为受项目根约束的文件读取、版本写入、文件监听和图片访问补服务测试。
- [x] 为 SceneDocument Command、Undo / Redo、自动保存和同步冲突补单元测试。
- [x] 为普通属性增量更新、结构变化替换 Scene root 补 Preview Command 分类测试，并完成人工 Canvas 长驻验收。
- [ ] 使用 Vitest 与 Vue Test Utils 为固定三栏、单 Scene 导航、层级、资产、画布和 Inspector 补 UI 测试；当前已覆盖 Pinia 边界、单 Scene 导航、层级结构操作、资产拖入与 Inspector preview / commit。
- [x] 为外部 `.scene` / 脚本 / 图片变化补集成测试。
- [x] 为新的只读 Editor context 补 CLI / 服务集成测试，不恢复旧 `live ...` 命令。
- [x] 为 Inspector 节点 ID 编辑补提交、重复 ID、选区重定位和 Undo / Redo 测试。
- [x] 为只读 `editor screenshot` 补 Host / 浏览器 session / CLI 测试，并验证 Scene 设计尺寸、zoom / pan 无关和 PNG 非空。
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
- [x] 实现项目图片与 Scene 资产拖入画布或层级，并接入自动保存和 Undo / Redo。
- [x] 删除未接入 vNext Editor 的旧 `live ...` CLI、固定端口 bridge、测试和文档入口。
- [x] 实现项目级 Host session discovery、单活动标签页接管和 `pixifact editor context`。
- [x] 实现顶栏手动刷新，在保持长驻 Canvas 的同时重新读取 Scene、脚本接口和图片预览。
- [x] 实现鼠标滚轮以光标为中心缩放 authoring 画布，并限制在 10%–400%。
- [x] 实现独立画布视图状态、同 Scene 重建保持、中心点 resize、空格/中键平移与适应窗口。
- [x] 实现同项目多标签页 standby 与显式接管，恢复 Scene / selection，并在接管时丢弃旧页工作区状态。
- [x] 实现外部当前 Scene、引用 Scene、配对脚本和图片的统一实时刷新，并只应用最新 generation。
- [x] 实现单 Scene 导航历史，支持从层级或画布双击 Scene Instance 进入，并在返回 / 前进时恢复 selection 和画布视图。
- [x] 实现 `pixifact editor screenshot --output <png-path>`，复用活动浏览器 Authoring Preview 输出设计尺寸 PNG。
- [x] 实现项目图片拖入 Inspector 图片资源字段，支持设置、替换和 Undo，不增加资源选择弹窗。
- [x] 将资产面板改为过滤后的项目相对目录树，保留 Scene 打开、图片拖拽和当前 Scene 高亮。
- [x] 在资产目录树的图片行显示紧凑真实缩略图，不增加网格模式或新面板。
- [x] 让资产目录首次仅展开当前 Scene 路径，并将用户展开集合保存为项目本地 UI 状态。
- [x] 实现撤销、重做、复制、删除和 Escape 的基础快捷键，并保护可编辑表单控件。
- [x] 接入 Inspector 节点 ID 编辑，保持稳定 locator、预览重建和配对脚本契约边界。

## Resume Protocol

1. 阅读 `AGENTS.md`、`CODEX.md` 和本文件。
2. 检查 worktree，不覆盖无关用户改动。
3. 阅读 [Testing](../testing/TESTING.md) 并从第一个未完成 Progress 项开始。
4. 先补对应 BDD / 失败测试，再实现目标行为。
5. 运行最小相关验证；停止时更新本文件的 Progress 和 Resume Notes。

## Resume Notes

Last updated: 2026-08-17

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
- 资产面板使用 Pointer Events 拖动项目索引中的现有图片和 Scene；开始拖动后自动切到层级，画布创建根级节点并写入 Scene 坐标，层级复用 before / inside / after 插入位置。
- 浏览器验收已完成 `hero.svg` 拖入画布和 `Button.scene` 拖入 `menuRow`，两次投放均可一次 Undo，Canvas 始终为一个且示例 Scene 最终无语义 diff。
- 删除未接入新版 Editor 的 `live summary`、`live scene get`、`live node inspect`、固定端口 bridge 实现及相关对外文档；CLI help 不再暴露旧入口。
- 实现系统临时目录中的项目级 session descriptor、健康检查、Host 复用和私有 token context 查询。
- `/api/events` 同时负责单活动标签页、文件变化通知和浏览器 context 上报；standby 标签页只接收恢复状态并可显式请求接管。
- `editor context` 返回 Scene root 或 Compiler node selection，并在磁盘 revision 不一致、Scene 未同步或解析失败时拒绝返回旧 selection。
- 外部 Scene 重载按路径合并并串行执行，选择只在原位修改、id rename 或唯一 id 移动时保守重定位。
- 真实浏览器验收已完成外部 `BottomMenu.scene` 的 `背包 -> 背包验收 -> 背包` 往返修改；Editor 自动刷新 revision 并保留确定的选择，Canvas 始终只有一个，示例 Scene 最终无 diff，当前 Host 无 console warning/error。
- Inspector 节点 ID 已支持失焦 / Enter 提交、重复与空值拒绝、选区迁移、预览重建和 Undo / Redo；不自动修改配对脚本 `@part` 契约。
- 全量测试为 16 个测试文件、222 个测试，`editor:typecheck`、`editor:frontend:build` 和包构建均通过。
- 顶栏手动刷新会等待当前 Scene 同步，重新读取项目索引、脚本接口和 Scene；同 revision 保留选择与 Undo / Redo，并通过更新 project tree 强制重建图片预览。
- 真实浏览器验收已完成 `背包 -> 背包刷新 -> 手动刷新 -> Undo 背包`；刷新前后选择保持为 `bagButton`、Undo 仍可用、Canvas 始终只有一个，示例 Scene 最终无 diff，当前 Host 无 console warning/error。
- 画布滚轮缩放直接更新 authoring preview root 的 scale / position；光标下 Scene 坐标保持不变，选择框同步更新，缩放限制为 10%–400%。
- 真实浏览器验收已完成围绕 `bagButton` 中心放大与恢复；选择框同步缩放，Canvas 始终只有一个，当前 Host 无 console warning/error。
- 画布视图独立于 Preview root；同路径 Scene 重建重放当前视图，切换路径重新适应，视口尺寸变化保持中心 Scene 坐标。
- `Space + 左键拖动`和中键拖动平移画布且不提交 Scene Command；“适应窗口”按钮将 Scene 居中并限制为最多 100%。
- 同项目多个浏览器标签页共享一个 Host，但只有 active 标签页加载工作区、接收文件变化并发布 context；standby 显示项目、当前 Scene 和接管入口。
- 接管只在当前 active context 已同步时执行；新 active 恢复 Scene / selection，原 active 立即卸载工作区并显示“此标签页已停止编辑”。
- 真实浏览器已完成两次双向接管；`BottomMenu.scene` 与 `bagButton` selection 均恢复，Undo / Redo 重新为空，两个标签页无 console warning/error。
- Host watcher 按项目相对路径合并重复通知；active Editor 使用 dirty-path 循环串行刷新，后到事件会废弃在途结果并把未应用路径并入最新 generation。
- 当前 Scene 外部 revision 建立新文档基线；非当前 Scene 与图片变化更新 ProjectTree，配对脚本变化更新只读 Scene interface，三类资源共用同一 Preview 重建入口。
- 自动化集成测试使用真实临时项目服务和磁盘文件，覆盖连续 Scene revision、引用 Scene、配对脚本与图片字节；Canvas 组件不重新挂载。
- 真实浏览器验收完成 `背包 -> 背包同步 -> 背包`、临时 `syncProbe` Prop 增删和 `bag.svg` 棕色 / 洋红 / 棕色往返；Canvas 始终为 1，最终示例项目无 diff，console 无 warning/error。
- 单 Scene 导航在当前标签页维护路径、selection 和画布视图；打开新 Scene 会截断前进分支，不引入多文档 Tab 或持久化状态。
- 真实浏览器验收完成层级与画布双击 `bagButton` 进入 `Button.scene`，返回恢复 `bagButton`，前进恢复 `labelText`；缩放后的子 Scene 画布往返前后像素一致，console 无 warning/error。
- `editor screenshot` 通过 session protocol v3 请求活动浏览器捕获当前 Preview root；Host 校验同步状态、preview ready、磁盘 revision 和 PNG 响应后再返回 CLI。
- 真实浏览器验收完成 `BottomMenu.scene` 设计尺寸 `750 x 154` 截图；zoom / pan 前后 PNG 均为 17,760 字节且 SHA-256 完全一致，截图非空、不含 Editor UI，示例项目无 diff，console 无 warning/error。
- Inspector 通过 Compiler field schema 的 `resource: image` 识别 `texture`，项目图片拖入后设置或替换项目相对路径；普通字符串、Scene 资产和 Binding 字段不接收。
- 图片资源 Command 复用自动保存与 Undo / Redo，但不走通用字符串增量赋值；Authoring Preview 重建 Scene root 并通过项目资源加载器得到 Pixi Texture，Application 与 Canvas 保持长驻。
- 真实浏览器验收完成 `map.svg -> bag.svg -> Undo map.svg`，两次均保持“已同步”，新版页面无可见错误，示例 Scene 最终无 diff。
- 资产面板直接从 `project.files` 构建项目相对目录树，只保留 Scene 和图片；首次打开时目录默认折叠，仅展开当前 Scene 的祖先路径。用户调整后的展开集合保存到 Git 忽略的 `.pixifact/editor/ui-state.json`，并由本地 Editor 服务跨重启恢复；文件夹优先排序，不新增 Pinia 项目状态或资源管理入口。
- 真实浏览器验收完成多级目录缩进、完整路径提示、当前 Scene 高亮、图片与其他 Scene 拖拽光标、`assets` 折叠 / 展开和双击打开 `Main.scene`，console 无 error。
- 图片资产行使用受项目根保护的 `/api/file` 显示 18 x 18 真实缩略图；项目索引更新会递增 URL generation，避免外部替换图片后继续显示浏览器缓存。
- 真实浏览器验收完成 13 张 SVG / PNG 缩略图加载；图片自然尺寸均非零，显示尺寸均为 18 x 18，目录树行高保持 29px，console 无 error。
- Editor 全局快捷键复用现有 SceneDocument Command：Cmd / Ctrl + Z 撤销、Cmd / Ctrl + Shift + Z 重做、Cmd / Ctrl + D 复制、Delete / Backspace 删除，Escape 优先取消当前直接操作再清空选择。
- 输入、文本域、下拉框和 contenteditable 保留原生键盘行为；真实浏览器验收完成复制、撤销、重做、两种删除键、Escape 和 Inspector 输入保护，`Button.scene` 最终无 diff，console 无 error。
- `editor-server` 的 macOS 递归 `fs.watch` 集成测试在写入前保留 100ms 原生 watcher 注册时间，默认并行发布检查已稳定通过。

Current State:
- 第一条纵向闭环可从 CLI 启动并在浏览器中使用。
- 仓库只保留 Vue 浏览器 Editor，不存在旧桌面入口或兼容层。
- vNext 已实现 read-only Editor context、单 Host / 单活动标签页和 CLI session discovery。
- read-only Editor context、标签页显式接管和外部 Scene 自动刷新已通过真实浏览器验收。
- CLI 不再暴露 `live summary`、`live scene get` 或 `live node inspect`，也不保留固定端口 bridge。
- 当前浏览器主包约 826 KB；TypeScript compiler 只存在于 Node/Bun extractor，不进入浏览器包。
- 层级结构编辑直接复用 Compiler Command，不存在第二套树 mutation 模型。
- 顶栏提供手动刷新入口，保存进行中或同步失败时禁用，避免与 versioned write 竞争。
- authoring 画布支持滚轮缩放、空格/中键平移和适应窗口，不修改 `.scene` 数据或替换 Pixi Application / Canvas。
- 顶栏返回 / 前进和 Scene Instance 双击入口已闭环，并按每个历史位置恢复 selection 与画布视图。
- CLI 已提供 `editor screenshot --output <png-path>`；成功输出 Scene、revision、设计尺寸、字节数和绝对输出路径。
- Inspector 已支持把资产面板中的项目图片拖入 `texture` 字段进行设置或替换，不包含点击选择器、搜索或资源管理能力。
- 资产面板按项目真实目录展示 Scene 和图片，首次仅展开当前 Scene 路径并持久恢复用户的目录展开集合；Scene 双击与既有资产 Pointer 拖拽流程保持不变。
- 资产目录树的图片行显示紧凑真实缩略图，并保留单列树布局与父行 Pointer 拖拽。
- Editor 已提供基础编辑快捷键，并在可编辑表单控件聚焦时不接管按键。
- Inspector 节点 ID 支持在“节点”区域编辑，提交后沿用新 locator，重复与空值被拒绝，Undo / Redo 和预览重建保持可用；配对脚本 `@part` 不由 Editor 自动修改。
- 当前测试集为 25 个测试文件、314 个测试；默认并行全量测试、核心包构建和 Editor 前端构建均通过。

Currently Failing:
- 无。

Next:
1. 继续补齐 `pixifact editor` 启动、本机地址限制和项目级服务发现测试。
