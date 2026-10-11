# Game Starter Template

状态：已完成按钮尺寸与点击反馈改版
权威范围：独立游戏项目模板、基础游戏流程与可替换 UI 库的实现和验收
上游文档：[./index.md](./index.md)、[../../AGENTS.md](../../AGENTS.md)、[../testing/TESTING.md](../testing/TESTING.md)

## Goal

提供可复制开发不同游戏的 Pixifact 项目模板，包含可运行的基础代码与保持统一契约的可替换 UI 库。

## Decisions

- 用户已选择独立游戏项目模板，以及通过替换 Scene 和图片更换整套 UI 风格。
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
- UI `.ts` 行为契约保持稳定；提供两套可以安装到同一路径的 `.scene` 外观和静态图片资产。替换后执行校验与编译，不新增全局运行时主题系统。
- 配对脚本和 `.scene` 是源码，生成代码、依赖与构建产物不提交。

## Non-Goals

- 不扩展 Pixifact 核心公共 API，不引入游戏服务容器、ECS、网络、广告、付费或通用第三方 UI 框架。
- 首版不承诺微信／抖音的存档和原生生命周期接入，不提供运行时图片路径 Binding 换肤。

## Public API / User-Facing Behavior

- `bun create pixifact my-game --template game` 创建完整游戏模板。
- 项目提供 dev / build / compile / editor / validate / typecheck，以及 UI 外观替换命令。
- README 说明基础模块、公开组件契约、替换流程和自定义玩法入口。
- 示例可在桌面和竖屏触摸视口完整运行；Runtime 能观察游戏阶段、得分、记录与弹窗状态。
- 启动即展示 UI 组件；Runtime 增加展台的点击次数、禁用状态、进度和弹窗结果快照。
- Button 展示区同时提供大、中、小三种按钮，三者均可点击；两套外观保持相同 size 和输入契约。

## Implementation Scope

- `packages/create-pixifact/templates/game/` 的配置、游戏逻辑、页面、UI、皮肤资源、替换脚本与说明。
- create-pixifact 的模板选择及版本同步脚本。
- 模板生成、规则、页面清理、UI 契约和两套外观的定向测试。
- 脚手架 README、计划索引及最小必要的发布安装验证。

## Test Plan

1. 先增加新模板生成失败测试；规则与生命周期用纯 TS / 真实 Group 的最小测试覆盖。
2. 两套 UI 分别通过 Scene 校验、compile-scenes、typecheck 和生产构建。
3. 真实浏览器操作完整流程，确认暂停屏蔽输入、多次重玩不会重复订阅、刷新恢复最高分。
4. 更换第二套外观后重复关键流程，确认游戏代码和 UI 行为契约不变。
5. 两套外观验证展台状态变化、进度边界、模态输入隔离和关闭后的状态保留；基准视口与短屏检查所有操作可达。
6. 验证三种尺寸、字号与图标区域联动、点击动画不改变命中盒、快速连点、移出松开／取消、禁用与销毁时结束动画；两套外观均通过组件与流程回归。

## Verification

- `bun run test -- tests/create-pixifact.test.ts tests/game-starter-core.test.ts tests/game-starter-ui.test.ts tests/game-starter-flow.test.ts`：4 个文件、21 项通过。
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

- 已有可用：`assets/ui/button.svg` 与 `assets/ui/panel.svg`，均为 `96 × 96`、透明背景的 SVG，用于按钮与面板九宫格；Paper / Mint 沿用各自 kit 的对应原稿，星标由 Label 节点表达。
- 需要新增：0。

## Progress

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
- 实现 `game` 模板、4 个 UI 组件、两套可安装外观和菜单／游戏／暂停／结算流程。
- 完成 21 项相关测试、两套 Web 构建、模板类型检查与打包内容检查。
- 默认首页改为 UI 组件展台，保留底部游戏入口；完成两套外观回归、真实输入与短屏检查，更新使用说明。
- Button 新增三种 size、97% 按压与 140ms 回弹；完成两套外观的测试、校验、类型检查、构建、截图和真实点击检查。

Current State:
- 最新要求已实现并验证；Paper 预览在 `http://127.0.0.1:5175/` 保持运行，等待用户检查。

Currently Failing:
- 本次定向测试、构建和组件展台真实输入无失败；初版全量套件与游戏手动全流程限制见上方记录。

Next:
- 无必需的实现或验证待办；后续按用户检查反馈继续。
