# Game Starter Template

状态：完成
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

## Progress

- [x] 读取仓库规范并审查当前能力。
- [x] 用户确认交付形式和 UI 替换方式。
- [x] 新模板与 UI 库实现。
- [x] 定向测试、两套构建和默认外观截图验收；浏览器手动流程限制见 Verification。
- [x] 使用说明、CLI 提示和打包检查更新。
- [x] 本任务源文件、文档和测试纳入同一个提交；生成目录和验证临时目录留在 Git 之外。

## Resume Protocol

先读本计划 Decisions 与 Resume Notes，检查 Git 状态，运行最小相关测试，然后从 Next 继续。

## Resume Notes

Last updated: 2026-10-07

Done:
- 实现 `game` 模板、4 个 UI 组件、两套可安装外观和菜单／游戏／暂停／结算流程。
- 完成 21 项相关测试、两套 Web 构建、模板类型检查与打包内容检查。

Current State:
- 实现、相关验证与两套外观截图复查完成。

Currently Failing:
- 定向测试无失败；全量套件与原生浏览器手动流程限制已列入 Verification。

Next:
- 无待实现功能。
