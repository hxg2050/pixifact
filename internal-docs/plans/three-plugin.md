# @pixifact/three

## Goal

以可选包接入原生 Three.js：共享 WebGL2 Canvas，Three 绘制世界、Pixifact 绘制 UI，沿用 Web / 微信 / 抖音 Vite 构建与代码分包。

2026-11-06 用户追加发布要求：随固定发布组六包发布 `0.20.0`，包含 `@pixifact/three` 首次 npm 发布。

## Decisions

- 包名 `@pixifact/three`，版本跟随仓库固定发布组；`three`、`pixi.js`、`pixifact` 为 peer dependencies。首版验证 Three 0.186.1 / Pixi 8.18.1；小游戏 loader 的内部接入固定 Three r186。
- `createThreeLayer(app, { scene, camera, ... })` 接管现有 Application 的 render 回调，保留同一个 ticker 和小游戏生命周期；销毁后恢复原回调。Three 与 Pixi 每次交接都 resetState，UI render 使用 clear:false。
- `layer.input` 是由 Pixi 底层命中面驱动的控件输入对象；UI 优先，指针归属持续到抬起/取消。原生 OrbitControls 和 Raycaster 可直接使用，不污染全局 DOM。
- `three()` Vite 插件沿用 VITE_PLATFORM。Web 使用 Three 原 loader；小游戏选择 Three 源码入口，替换 FileLoader / ImageLoader，并为 GLTFLoader 提供局部 Blob/URL 环境。网络、文件、图片与分包下载复用 Pixi DOMAdapter 和原生分包 loader；嵌入图片写临时文件并清理。
- `registerPixiRuntime` 增加可选 captureScreenshot 回调；layer.captureScreenshot 同步重绘并导出完整 3D+UI 的逻辑分辨率 PNG。
- Native Scene/Camera/Mesh 与游戏 TypeScript 保持原生；`.scene` 继续负责 2D UI。只在游戏分包导入插件/Three，即可将引擎留在分包。
- 发布沿用 Changesets、tag workflow 和 npm Trusted Publishing；`@pixifact/three` 首次发布使用 npm 账号认证，再配置该包的 Trusted Publisher。

## Non-Goals

WASM、物理引擎、Draco/KTX2 解码器、3D Scene schema 或可视化 3D 编辑器、迁移 find-more 项目。

## Public API / User-Facing Behavior

- `@pixifact/three`: createThreeLayer、对应 options/layer 类型。
- `@pixifact/three/vite`: three()。
- layer 暴露 renderer、scene、camera、input、raycast、render、captureScreenshot、destroy。
- Application renderer.resize 后自动同步绘制尺寸和透视相机 aspect；小游戏窗口变化更新 Application 尺寸。
- layer.destroy 释放自身 renderer 和输入绑定，不移除共享 Canvas，不丢失共享 context；模型、材质、纹理由游戏按 Three 原生规则 dispose。

## Implementation Scope

新增包、构建/发布清单、可运行三端示例、中文接入文档；少量 core runtime 截图与小游戏 resize 接入；聚焦插件行为和真实三端出包的测试。

## Test Plan

1. BDD：共享上下文合成、UI 优先与手势归属、普通 glTF/GLB 资源、完整截图、三端分包隔离。
2. Red：新增插件边界测试与 runtime 截图回调测试，确认缺少实现时失败。
3. Green：渲染顺序/尺寸/销毁，真实 OrbitControls 与 Raycaster，原生资源 transport、分包/失败清理；真实 Vite 三端构建。
4. Chrome WebGL2 冒烟：Three 模型 + Pixi UI、多帧/resize/截图像素、无 GL 错误；小游戏以 mock host + 实际 CommonJS 执行验收，真机状态单独注明。
5. 全量测试、runtime 构建、npm tarball 入口与仓库外安装检查。
6. 发布由 tag workflow 重跑全量测试、构建、六包内容和仓库外安装检查；完成后核对六包 npm 版本、latest 和 GitHub Release。

## Verification

- `bun run test`：32 个文件 / 431 项通过。覆盖实际 OrbitControls / Raycaster、UI 手势归属、共享渲染与恢复、普通 glTF/GLB、失败纹理清理、三端真实构建和小游戏 CommonJS 执行。
- `bun run build`：core、微信、抖音构建通过；最终插件独立 build 通过。示例 `tsc --noEmit` 通过。
- `bun run editor:typecheck` / `bun run editor:frontend:build` 通过。
- `bun scripts/check-release-packages.mjs`：六包 tarball 入口、README、LICENSE 通过。
- `bun scripts/check-release-install.mjs`：仓库外真实 tarball 安装通过；2D 不安装 Three；Three 示例 Scene 校验及 Web / 微信 / 抖音构建通过。安装环境使用 Vite 8.3.6，仓库固定 Vite 8.0.14。
- Chrome headless WebGL2 / SwiftShader：5 帧逻辑尺寸 320×240、DPR 2；Three 红色模型、蓝色背景和 Pixi 绿色 stencil 遮罩逐像素正确。resize 后截图 240×320；每个 GL 调用均未检测到错误，detach 后 context 保留且 Pixi 可以继续绘制。
- GPU 冒烟发现并修复 Pixi 初始化后的 premultiply unpack 状态影响 Three 构造 texImage3D；创建 Three 前先调用 Pixi resetState。
- 示例 Web Runtime 实际截图 800×600，包含 Three 模型和 Scene HUD。点击 HUD 暂停按钮后 `paused:true`，camera 仍为 `[3,2,5]`。
- 示例微信产物约主包 591 KB / game 657 KB / models 1.5 KB，抖音约主包 601 KB / game 657 KB；引擎模块只位于游戏代码分包。数值为本次本地构建观测，不作为预算承诺。
- `bun install --frozen-lockfile` / `git diff --check` 通过。小游戏设备 GPU 未验收；未发布 npm。

## Progress

- [x] 阅读仓库规范、现有构建/资源/输入/runtime 观察代码和 Three 源码。
- [x] 确认 API 和边界。
- [x] 失败测试。
- [x] 实现与示例。
- [x] 验证与文档；完成后按仓库规则提交。
- [x] 生成六包 `0.20.0`、更新 changelog 和脚手架版本；版本一致性、frozen lockfile、diff 检查通过。
- [ ] 发布六包、配置新包 Trusted Publisher 并核对发布结果。

## Resume Protocol

先读本计划与 git status，运行 Resume Notes 中最小目标测试，从 Next 继续；不重做已经确认的架构。

## Resume Notes

Last updated: 2026-11-06

Done: 插件、Vite 资源适配、完整截图、小游戏 resize、示例、中英文文档、发布清单和测试均完成，验证见上。

Current State: 功能与六包 `0.20.0` 版本准备完成；用户已授权发布。现有五包通过 Trusted Publishing 发布；本机 npm 尚未登录，已启动网页登录供用户完成 `@pixifact/three` 首次发布认证。GitHub API 正常，Git HTTPS 连接需重试。WASM 与 3D Editor 保持 Non-Goals。

Next:
1. 提交 `0.20.0`，推送 main/tag，由 CI 完整验证。
2. 完成新包 npm 首次发布和 Trusted Publisher 配置，重跑 CI 并核对六包 registry / GitHub Release。
3. 更新发布记录并提交；小游戏开发者工具/真机 GPU 验收仍由用户后续安排。
