# Game Starter Template

状态：已按用户澄清收敛为一套基础 UI，支持直接覆盖同名 PNG
权威范围：独立游戏项目模板、基础游戏流程与可替换 UI 库的实现和验收
上游文档：[./index.md](./index.md)、[../../AGENTS.md](../../AGENTS.md)、[../testing/TESTING.md](../testing/TESTING.md)

## Goal

提供可复制开发不同游戏的 Pixifact 项目模板，包含可运行的基础代码、一套基础 UI 与可直接替换的同名 PNG 素材。

## Decisions

- 用户已选择独立游戏项目模板；最新明确只提供一套基础 UI，后续用户直接覆盖同名 PNG 素材文件。
- 新增 `create-pixifact --template game`，保留当前最小模板的用途。
- 首版交付 Web 项目，复用 Pixifact 的 Scene、事件、slot、资源准备、viewport 和 Runtime；平台扩展沿用既有平台包。
- 业务状态与 UI 分离；示例走通菜单、开始、得分、暂停、继续、结算、重玩、返回菜单。
- 页面与弹窗分层；页面切换断开外部事件订阅并销毁旧节点，弹窗期间屏蔽底层输入。
- 最高分采用显式 Web storage 读写；无旧格式迁移、静默错误处理或额外存储依赖。
- UI 包含 Button、Panel、Dialog、ProgressBar；游戏只依赖公开 Props / Events / Slots。
- 2026-10-12 用户要求示例主要展示 UI 组件：默认首页改为四种组件的交互展台，原游戏流程移至次要入口；复用现有 Paper / Mint 素材，不新增运行时主题系统。
- 展台支持按钮点击计数、禁用状态切换、0–100% 进度增减、弹窗确认／取消反馈；弹窗期间屏蔽底层操作，不改变游戏分数或存档。
- 按用户最新要求，Button 增加 `size="large|medium|small"`，使用原生 `defineVariants` 同时控制默认盒子尺寸、字号、文字边距与图标区域；默认 medium，父 Scene 仍可指定宽高或拉伸布局。
- 按下时视觉层缩至 97%，松开后 140ms 恢复；只变换内层视觉 Group，根布局盒与命中区域保持稳定。使用 Pixi 原生 onRender，不新增动画依赖或全局 ticker；禁用、移出松开、取消和销毁都能结束反馈。
- 只维护 `src/ui/` 中的一套基础组件与 `assets/ui/` 中的基础 PNG，不提供多套外观目录或安装命令；更换素材时保留文件路径、96 × 96 尺寸和九宫格切片约定，Scene 与行为脚本不需要修改。
- 配对脚本和 `.scene` 是源码，生成代码、依赖与构建产物不提交。
- 2026-10-12 用户要求按钮再缩小，设计分辨率改为竖屏 `1080 × 1920`，viewport 使用 `fixedWidth`；随后反馈分辨率变更后按钮又过小。按新设计坐标重新校准为 `360 × 96 / 280 × 80 / 200 × 64`，字号为 `42 / 36 / 32`。展示、弹窗和游戏入口同步调整，不以拉伸按钮填满面板。
- 页面和模态管理器采用原生 frame layout 随 GameApp 可用高度变化；页面背景与弹窗遮罩铺满实际逻辑视口。组件展台和示例页面复用原生 ScrollContainer，在短窗口中保留底部操作可达性，不新增适配依赖。
- 用户要求素材使用 PNG：沿用已有美术，将当前外观与 Paper / Mint 中的按钮、面板素材转换为透明 RGBA PNG，同步全部 Scene 引用并移除不再使用的 SVG；不新增项目依赖。
- 2026-10-12 用户澄清 UI 替换方式：提供一套基础，使用者自己替换图片文件即可；删除此前增加的 Paper / Mint kit 副本、`ui:apply` 与安装脚本，并迁移 CLI、文档、测试和发布安装检查。当前基础外观继续使用已有两张 PNG；进度条颜色和文字由 Scene 表达，图片只负责对应组件背景。
- 打包验证发现本任务在模板目录生成的 `.pixifact`、`dist` 和 Vite 依赖缓存也会被 `templates/` 文件清单带入包；发布清单排除这三类生成目录，基础源码与两张 PNG 正常分发。

## Non-Goals

- 不扩展 Pixifact 核心公共 API，不引入游戏服务容器、ECS、网络、广告、付费或通用第三方 UI 框架。
- 首版不承诺微信／抖音的存档和原生生命周期接入，不提供运行时图片路径 Binding 换肤。

## Public API / User-Facing Behavior

- `bun create pixifact my-game --template game` 创建完整游戏模板。
- 项目提供 dev / build / compile / editor / validate / typecheck；用户直接替换同名 PNG，无 UI Kit 安装步骤。
- README 说明基础模块、公开组件契约、替换流程和自定义玩法入口。
- 示例可在桌面和竖屏触摸视口完整运行；Runtime 能观察游戏阶段、得分、记录与弹窗状态。
- 启动即展示 UI 组件；Runtime 增加展台的点击次数、禁用状态、进度和弹窗结果快照。
- Button 展示区同时提供大、中、小三种按钮，三者均可点击；更换 PNG 后继续使用相同 size 和输入契约。

## Implementation Scope

- `packages/create-pixifact/templates/game/` 的配置、游戏逻辑、页面、UI、基础 PNG 与说明。
- create-pixifact 的模板选择及版本同步脚本。
- 模板生成、规则、页面清理、基础 UI 契约和 PNG 加载的定向测试。
- 脚手架 README、计划索引及最小必要的发布安装验证。

## Test Plan

1. 先增加新模板生成失败测试；规则与生命周期用纯 TS / 真实 Group 的最小测试覆盖。
2. 基础 UI 通过 Scene 校验、compile-scenes、typecheck 和生产构建。
3. 真实浏览器操作完整流程，确认暂停屏蔽输入、多次重玩不会重复订阅、刷新恢复最高分。
4. 在临时项目只替换同名 PNG，确认无需修改 Scene 与 TypeScript，即可重新构建并显示图片。
5. 基础 UI 验证展台状态变化、进度边界、模态输入隔离和关闭后的状态保留；基准视口与短屏检查所有操作可达。
6. 验证三种尺寸、字号与图标区域联动、点击动画不改变命中盒、快速连点、移出松开／取消、禁用与销毁时结束动画。
7. 验证模板的 1080p / fixedWidth 配置、页面与弹层随视口高度调整、短窗口滚动和遮罩隔离；真实检查默认窗口、375 × 667 与较短的宽窗口。
8. 校验 PNG 文件签名、96 × 96 尺寸、RGBA 编码，以及生成项目不携带多套 kit 和安装脚本。

## Verification

- 上次 PNG 迁移后，`bun run test -- tests/create-pixifact.test.ts tests/game-starter-core.test.ts tests/game-starter-ui.test.ts tests/game-starter-flow.test.ts`：4 个文件、22 项通过；下方历史记录中的两套外观已由用户最新要求替代。
- 两套 UI 用真实 compiler 生成节点，使用官方 Pixi events extension 和 RenderGroup 变换更新进行 EventBoundary 命中检查；暂停、恢复、结算、重玩、返回、旧事件隔离和重新实例化恢复存档均通过。
- `bun run build`：核心包和平台包构建通过；create-pixifact 自身 TypeScript 构建通过。
- `scene validate --all`：全部 7 个 Scene 通过；compile-scenes 与模板 typecheck 通过。
- 在 `/tmp/pixifact-game-starter-97xCE1/game` 创建仓库外独立项目，使用工作区已构建依赖，Bun 1.3.13 下 paper / mint 的 Web 构建和开发服务通过。
- `bun scripts/check-release-packages.mjs`：五包打包内容检查通过；未执行完整发布安装脚本或 npm 发布。
- Pixifact `scene screenshot` 输出 paper / mint 菜单 `750 × 1334` PNG，均已视觉检查中文说明、按钮和底部文案无溢出；两套背景与按钮美术正确替换。
- 全量测试运行中出现既有 Editor / 平台测试超时，已中断；没有宣称全量通过。当前验证以定向测试、构建及打包内容为准。
- 原生浏览器控制连接多次超时，未完成手动浏览器全流程与页面刷新操作；规则、持久化及真实 Pixi 输入路径由上述集成测试验证。
- 初次仓库外目录使用 Bun 1.4.2 时 Vite 配置临时模块加载失败；切换到仓库指定的 Bun 1.3.13 后通过。模板声明 `packageManager: bun@1.3.13`。
- npm 依赖安装尝试长时间停在 resolving，终止后改用工作区本地依赖验证，不将该结果当成 registry 安装验收。

### 2026-10-12 UI 组件展台

- 先扩展两套外观的行为测试，验证旧实现缺少展台状态时失败；实装后 4 个相关文件、21 项测试通过。
- Paper / Mint 的按钮点击、禁用切换、进度上下限、弹窗确认／取消、模态输入隔离、状态保留、旧页面事件清理均由真实 compiler 与 Pixi EventBoundary 集成测试覆盖；展台不会改写游戏存档，原游戏完整流程继续通过。
- Paper / Mint 均通过 7 个 Scene 校验、compile-scenes、TypeScript 检查和 Web 生产构建；Mint 在仓库外临时项目验证，不覆盖当前生效的 Paper 资源。
- 当前 `http://127.0.0.1:5175/` 的真实 Canvas 在 `609 × 844` 和 `375 × 667` 视口完整显示四个组件区块与游戏入口；通过 Runtime 标准指针输入验证禁用按钮不计数、启用后计数、0% / 100% 边界、弹窗阻止底层点击、确认／取消结果和关闭后状态保留。
- 真实截图：`/tmp/pixifact-gallery-paper-final.png`、`/tmp/pixifact-gallery-short.png`、`/tmp/pixifact-gallery-dialog-short.png`。Mint `750 × 1334` 静态预览为 `/tmp/pixifact-gallery-mint.png`，静态预览不执行脚本，进度填充与交互以集成测试为准。
- 原弹窗示例说明过长，已缩短并在短屏实际截图复查；最终 Runtime 错误日志为空。临时浏览器视口已恢复，预览仍运行，尚未经过用户验收。

### 2026-10-12 按钮尺寸与点击反馈

- 先扩展组件与流程测试，旧实现的 5 项测试因缺少 size 契约与视觉层而失败；最终 4 个相关文件、21 项测试全部通过。
- Paper / Mint 均验证三种默认宽高、字号、图标区域及运行时 size 切换；按压不改变根命中盒，140ms 回弹、快速连点、移出／外部松开／取消、禁用反馈与销毁后的渲染回调清理均通过。
- 两套 UI 通过全部 7 个 Scene 校验、编译、模板 TypeScript 检查和 Web 生产构建；Mint 在仓库外临时项目应用并验证。
- 展台并排展示三种尺寸；在 Scene 中明确展示按钮高度，使静态预览和真实运行的布局一致。真实浏览器分别点击三种按钮后计数为 3，点击禁用按钮后计数不变；Runtime 确认回弹后 visual 的 scale 为 1、位置为 0。
- 当前预览在 `609 × 844` 与 `375 × 667` 均完整显示全部操作。截图为 `/tmp/pixifact-button-sizes-paper-final.png`、`/tmp/pixifact-button-sizes-short.png`；Mint 静态布局截图为 `/tmp/pixifact-button-sizes-mint.png`，静态截图不执行进度脚本。
- 最终 Runtime 错误日志为空；临时视口已恢复，`http://127.0.0.1:5175/` 继续运行并保持打开。

### 本次素材盘点

- 已有可用：基础 UI 的 `assets/ui/button.png`、`assets/ui/panel.png`，共 2 个文件，均为 `96 × 96`、透明 RGBA PNG，用于按钮与面板／弹窗九宫格；沿用原有美术，星标由 Label 节点表达。
- 需要新增：0。

### 2026-10-12 1080p fixedWidth 与尺寸校准

- 配置改为竖屏 `1080 × 1920` 与 `fixedWidth`；GameApp 读取项目分辨率，页面与模态管理器通过原生 frame layout 跟随实际逻辑视口。三种按钮、图标和字号按新坐标校准，两套 kit 同步。
- 最初将按钮进一步缩小后，用户指出分辨率变更导致显示过小；最终采用 `360 × 96 / 280 × 80 / 200 × 64` 和 `42 / 36 / 32` 字号，点击动画保持不变。
- 先验证旧实现的配置、页面适配和尺寸测试失败；最终 4 个相关文件、22 项通过，覆盖替换页面后的尺寸、短窗口滚动、弹窗打开期间调整视口和输入隔离，以及完整游戏流程。
- Paper / Mint 均通过 7 个 Scene 校验、compile-scenes、TypeScript 检查与 Web 生产构建。Mint 在仓库外临时项目验证，静态 `1080 × 1920` 截图为 `/tmp/pixifact-fixedwidth-mint-final.png`；静态截图不执行进度脚本。
- 真实预览检查了 `482 × 844`、`375 × 667` 和 `960 × 640`：三档点击计数为 3，禁用及遮罩后的点击不增加计数；在移动端，GameApp 与 Dialog 都是 `1080 × 1920.96` 的逻辑盒子，实际边界完整覆盖 `375 × 667`。
- 宽而短窗口使用真实滚轮滚动到末尾，内容偏移为 `-832`，弹窗和游戏入口完整可达。证据为 `/tmp/pixifact-fixedwidth-mobile-dialog-final.png`、`/tmp/pixifact-fixedwidth-short-window.png` 与 `/tmp/pixifact-fixedwidth-paper-final.png`。移动端标准 Runtime 输入确认弹窗关闭，展台计数与状态保留。
- 最终 Runtime 错误日志为空；已清除临时视口覆盖并保留预览标签，`http://127.0.0.1:5175/` 继续运行。

### 2026-10-12 PNG 素材

- 使用已安装的 Sharp 将现有美术转换为 6 个 PNG，未引入项目依赖；删除 6 个失去引用的 SVG，当前外观与两套 kit 的 Scene 全部引用 PNG，更新换肤说明。
- 测试检查实际 PNG 签名、96 × 96 尺寸与 RGBA 编码，确认资源目录只包含 `button.png`、`panel.png`；先验证旧资源失败，转换后 4 个文件、22 项测试全部通过。
- 两套外观再次通过 7 个 Scene 校验、编译与 Web 生产构建。Mint 静态截图为 `/tmp/pixifact-game-png-mint.png`，Paper 真实 Canvas 截图为 `/tmp/pixifact-game-png-paper-final.png`。
- Vite 热更新保留了旧 SVG 清单，重启本任务的 5175 预览服务后正常加载 PNG；未改变其他服务。真实点击将展台计数更新为 1，最终 Runtime ready 为 true，错误日志为空。
- PNG 格式迁移新增 6 个素材文件，移除 6 个 SVG；新增 PNG 是用户明确要求的交付资产，与本次相关源码一起提交。

### 2026-10-12 一套基础 UI 与直接替换图片

- 先更新脚手架测试，旧实现因仍携带 `ui:apply` 和旧 CLI 提示而出现 2 项预期失败；删除 Paper / Mint 的 20 个重复组件／资源文件与安装脚本，保留 `src/ui/` 的基础组件和 `assets/ui/` 的两张 PNG。
- 文档和 CLI 改为直接覆盖同名图片；明确 96 × 96、透明 PNG、四边各 24 像素九宫格约定。展台移除“两套外观”文案，按钮尺寸、点击动画、布局与业务状态契约继续使用已有实现。
- 相关 4 个文件、20 项测试通过；基础 UI 的 PNG 签名、两个实际加载路径、组件交互、动画边界、短窗口适配和完整游戏流程均通过。7 个 Scene 校验、编译、模板 TypeScript 检查、Web 生产构建和 create-pixifact 构建通过；发布安装脚本语法检查通过，未运行完整网络安装／发布流程。
- 在临时脚手架项目中仅互换 `button.png` / `panel.png` 文件，20 个 Scene／TypeScript 源文件 SHA-256 保持一致，生产构建通过；静态 `1080 × 1920` 截图 `/tmp/pixifact-basic-ui-replaced-png.png` 正确显示替换后的背景，静态截图不用于证明进度脚本或点击交互。
- npm 打包内容检查确认基础 PNG 正常分发，无 kit、安装脚本、生成 Scene、构建输出或模板 node_modules 缓存。
- 当前预览 `http://127.0.0.1:5175/` 已同步新文案，Runtime ready 为 true，错误日志为空；真实 Canvas 截图 `/tmp/pixifact-basic-ui-final.png` 为 `482 × 844`。本次不改变用户存档；临时替换素材验证项目已清理。

## Progress

- [x] 收敛为一套基础 UI，移除 kit 与切换命令，验证直接替换 PNG 和预览。
- [x] PNG 素材转换、引用迁移、两套外观回归与真实加载检查。
- [x] 按用户反馈校准按钮、1080p fixedWidth、页面与弹窗适配、短窗口验证。
- [x] 大中小按钮、轻微点击动画、两套外观验证与预览更新。
- [x] UI 组件展台改版、定向验证及预览更新。
- [x] 读取仓库规范并审查当前能力。
- [x] 用户确认交付形式和 UI 替换方式。
- [x] 新模板与 UI 库实现。
- [x] 定向测试、两套构建和默认外观截图验收；浏览器手动流程限制见 Verification。
- [x] 使用说明、CLI 提示和打包检查更新。
- [x] 本任务源文件、文档和测试纳入同一个提交；生成目录和验证临时目录留在 Git 之外。

## Resume Protocol

先读本计划 Decisions 与 Resume Notes，检查 Git 状态，运行最小相关测试，然后从 Next 继续。

## Resume Notes

Last updated: 2026-10-12

Done:
- 实现 `game` 模板、4 个基础 UI 组件、交互展台和游戏／暂停／结算流程。
- Button 支持三种 size、97% 按压与 140ms 回弹；使用 1080p fixedWidth，页面与弹窗随可用视口高度变化，短窗口可滚动。
- 已按用户最新要求删除多套 kit 和安装入口，只保留一套基础 UI；使用者覆盖两张同名 PNG 即可更换对应背景。
- 完成 20 项相关测试、7 个 Scene 校验／编译、模板类型检查、Web 构建、脚手架构建与 PNG 替换的静态显示验证。
- 发布清单排除模板生成缓存；npm 打包内容检查基础 PNG、kit 清理和缓存排除通过。

Current State:
- 最新要求已完成；`http://127.0.0.1:5175/` 继续展示一套基础 UI，开发服务 session 为 78225，等待用户检查。

Currently Failing:
- 本次定向测试、构建和组件展台真实输入无失败；初版全量套件与游戏手动全流程限制见上方记录。

Next:
- 无必需的实现或验证待办；后续按用户检查反馈继续。
