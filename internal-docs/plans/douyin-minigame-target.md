## Goal

为 Pixifact 增加可导入抖音小游戏开发者工具的 `douyin` target。Web、微信和抖音共享 `.scene`、Scene 脚本与游戏逻辑；平台差异集中在 Runtime、原生配置、资源交付和构建策略。

## Decisions

- target 名称使用 `douyin`，公开 Runtime 入口使用 `pixifact/platform/douyin`。
- 首版支持抖音普通小游戏 JS Runtime，不支持 Unity 小游戏方案。
- 首版支持 PixiJS WebGL、Text、Graphics、现有 Pixifact runtime 节点、触摸、生命周期、本地资源、分包和 HTTPS 远程资源。
- 首版不接上传、审核、发布、登录、广告、支付、分享和开放数据域。
- 抽取内部小游戏公共 Runtime / builder；保留 `pixifact/platform/wechat` 的现有公开 API，不新增旧入口兼容层。
- 抖音 Scene 纹理首版只支持 PNG、JPEG、WebP；继续拒绝 SVG、HTMLText 和 DOMContainer，直到真实运行时验证通过。
- 抖音 bundle 输出目标使用 ES2018；抖音真机调试编译器不接受 ES2020 的 `??` 和 `?.`，微信继续使用 ES2020。

## Non-Goals

- 不实现抖音平台开放能力 SDK。
- 不实现抖音开发者工具自动化上传或审核流程。
- 不把 Web Vite 构建迁移到 CLI target 系统。
- 不重命名现有微信 target、配置路径或公开 API。

## Public API / User-Facing Behavior

- `pixifact.project.json` 支持 `targets.douyin`，字段结构与微信 target 对齐。
- CLI 支持 `validate/build/dev --target douyin`。
- `pixifact/platform/douyin` 提供抖音 PixiJS Application、资源读取和分包加载 API。
- 抖音输出目录包含 `game.js`、`game.json`、`project.config.json`、资源和分包，可直接导入抖音小游戏开发者工具。

## Implementation Scope

- `packages/pixifact/src/project/`：增加 Douyin target 配置并复用小游戏资源包类型。
- `packages/pixifact/src/platform/minigame/`：内部公共 Canvas、Pixi adapter、输入、生命周期、fetch、subpackage 和 Application 能力。
- `packages/pixifact/src/platform/wechat/`：迁移到公共能力，保持现有导出和行为。
- `packages/pixifact/src/platform/douyin/`：实现 `tt` API 类型和平台 facade。
- `packages/pixifact-cli/src/`：抽取小游戏 builder，增加 WeChat / Douyin 平台策略和 CLI 分发。
- `tests/`：增加 Douyin 配置、构建、bundle 启动和 Runtime mock 测试；保留微信测试。
- `sample-projects/wechat-minigame-demo/`：增加 Douyin 入口与配置，扩展三目标构建脚本和说明。
- `docs/zh/`、`packages/pixifact-cli/README.md`：补充抖音 target 使用和支持边界。

## Test Plan

- [x] 先写 Douyin project config、CLI target 和 Runtime mock 的失败测试。
- [x] 验证 Douyin `subPackages`、`tt` 触摸字段和条件包体规则。
- [x] 验证 bundle 在无 DOM/BOM、仅提供 `tt` 的 VM 中启动。
- [x] 构建三目标 sample，检查输出文件、资源 manifest 和分包。
- [ ] 在抖音开发者工具中导入产物并完成 WebGL、Text、输入、生命周期、资源检查。
- [ ] 至少在 Android 和 iOS 真机完成启动、触摸、后台恢复和资源加载验证；工具或设备不可用时记录为外部验证缺口。

## Verification

```bash
bun run test
bun run build
bun run example:build
```

抖音开发者工具验证：导入 `sample-projects/wechat-minigame-demo/dist/douyin`，完成支持矩阵中的模拟器和真机检查。

## Progress

- [x] 计划和失败测试。
- [x] 公共 Runtime / builder。
- [x] Douyin target、CLI 和 sample。
- [x] 文档、完整测试和自动化构建验证。
- [ ] 抖音开发者工具导入、Android / iOS 真机验证。
- [x] 提交相关 tracked 和新增文件。

## Resume Protocol

1. 阅读本文件。
2. 检查 worktree 状态。
3. 运行当前 `Resume Notes` 中的最小相关测试。
4. 从 `Next` 继续，不重新打开已确定的 Decisions。
5. 未完成时更新本文件。

## Resume Notes

Last updated: 2026-08-10

Done:
- 已确定 `douyin` target、普通小游戏范围和首版非目标。
- 已确认抖音 `subPackages`、`tt` 触摸坐标和包体限制需要独立平台策略。
- 已实现公共小游戏 Runtime / builder，并保留微信公开入口。
- 已实现抖音 target、CLI 分发、`pixifact/platform/douyin`、三目标示例、文档和测试。
- `bun run test`（21 个测试文件、283 个测试）、`bun run build`、示例三目标 validate/build、Changeset 状态和 `git diff --check` 均通过。
- 抖音 production 示例构建报告：主包 508874 bytes、分包 118 bytes、总计 508992 bytes。
- 已复现真机调试编译器在 `game.js` 的 `??` 处报 `Unexpected token`，将抖音输出目标从 ES2020 调整为 ES2018，并增加产物语法回归测试。
- 修复后 `bun run test`（21 个测试文件、283 个测试）、`bun run build`、`bun run build:dy` 和 `git diff --check` 均通过；新抖音产物主包 515838 bytes、总计 515956 bytes。

Current State:
- 仓库自动验证通过，抖音构建产物可生成于 `sample-projects/wechat-minigame-demo/dist/douyin`。
- 示例 `platforms/douyin/project.config.json` 使用空 `appid` 占位，导入开发者工具前必须替换为真实 AppID。
- 已重新生成 ES2018 抖音产物，等待开发者工具清缓存后再次执行真机调试。

Currently Failing:
- 无仓库内自动化失败。
- 用户报告的旧产物真机编译失败已修复，更新后的产物尚待开发者工具复验。
- Android / iOS 的完整启动、触摸、后台恢复和资源加载验证尚未完成。

Next:
1. 在抖音开发者工具中清除旧编译缓存，重新导入或编译 `sample-projects/wechat-minigame-demo/dist/douyin` 并执行真机调试。
2. 按支持矩阵验证启动、WebGL、Text、Graphics、触摸、生命周期、本地 JSON、分包和远程资源。
3. 在 Android 和 iOS 真机各完成一次启动、触摸、后台恢复和资源加载验证。
