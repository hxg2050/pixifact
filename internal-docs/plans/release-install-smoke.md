# Release Install Smoke Plan

## Goal

建立一个使用当前仓库真实 npm tarball 的仓库外验收链路，确保外部 Agent 获得 `adventure-ui-demo` 后，可以只通过公开包入口完成 Scene 发现、检查、校验、编译、项目构建和 Editor 启动验证。

## Decisions

- 验收必须把 `pixifact` 和 `pixifact-cli` 打包后安装到仓库外临时目录，不能直接执行仓库源码入口。
- `adventure-ui-demo` 必须使用 `pixifact`、`pixifact/compiler-node` 和 `pixifact` CLI 等正式公开入口，不能引用 `../../packages/**`。
- 发布验收使用当前 tarball，不依赖 npm registry 上可能滞后的版本。
- Editor 验收只确认 CLI 能启动服务且首页可访问，随后主动停止进程；不做浏览器 UI 功能测试。
- 验收脚本必须自动清理临时目录，不在仓库中留下 tarball、安装目录或生成产物。
- 该验收进入 `release:check`，成为发布前门禁。

## Non-Goals

- 不发布 npm 包、不创建 release 或 tag。
- 不修改 `.scene` 语法、Compiler 语义或 Editor 产品功能。
- 不处理微信小游戏示例的独立安装链路。
- 不为旧版 npm 包增加兼容层。

## Public API / User-Facing Behavior

- `sample-projects/adventure-ui-demo` 改为使用公开 CLI 和 `pixifact/compiler-node`，复制到仓库外后可安装真实包并运行。
- CLI 命令本身不新增或修改公开参数。

## Implementation Scope

- 增加仓库外 tarball 安装与命令链路验收脚本。
- 调整 `adventure-ui-demo` 的 package scripts、Vite config 和 TypeScript config，移除 monorepo 源码相对路径。
- 将示例依赖版本纳入 release version 同步。
- 更新发布检查、测试和相关维护文档。

## Test Plan

1. 先新增静态测试，要求示例不再包含 `../../packages/**` 或 `workspace:*`，并使用公开 CLI / compiler-node 入口。
2. 先直接运行仓库外验收脚本，记录当前失败位置。
3. 完成最小实现后运行：
   - `rtk bunx --no-install vitest run tests/sample-projects.test.ts tests/create-pixifact.test.ts`
   - `rtk bun run build`
   - `rtk bun run editor:frontend:build`
   - `rtk bun scripts/check-release-install.mjs`
   - `rtk bun run test`

## Verification

- 2026-08-04 通过 `rtk bunx --no-install vitest run tests/sample-projects.test.ts tests/create-pixifact.test.ts`，共 2 个测试文件、7 项测试。
- 2026-08-04 通过 `rtk bun scripts/check-release-install.mjs`：真实 tarball 在仓库外完成安装、CLI help、summary、inspect、validate、compile-scenes、Vite build 和 Editor HTTP 验收。
- 2026-08-04 通过 `rtk bun run release:check`：共 17 个测试文件、229 项测试，并完成全部发布构建与检查。

## Progress

- [x] 独立 Agent 已复现公开 npm 包和示例之间的版本漂移与仓库外运行失败。
- [x] 已确定 tarball 安装验收的边界和成功标准。
- [x] 添加失败测试。
- [x] 实现仓库外发布形态验收。
- [x] 修复示例正式包入口。
- [x] 运行完整验证。

## Resume Protocol

继续本任务时：

1. 阅读 `AGENTS.md`、`CODEX.md`、`internal-docs/testing/TESTING.md` 和本计划。
2. 查看 `git status --short`，保留不属于本任务的修改。
3. 运行 `rtk bunx --no-install vitest run tests/sample-projects.test.ts tests/create-pixifact.test.ts`。
4. 从 `Resume Notes` 的 `Next` 继续。

## Resume Notes

Last updated: 2026-08-04

Done:
- 已完成独立外部 Agent 评估。
- 已确认现有发布检查只执行 `npm pack --dry-run`，没有安装并运行 tarball。
- 已确认 `adventure-ui-demo` 的 package scripts、Vite config、tsconfig 和 workspace 依赖仍耦合 monorepo。
- 已将示例切换到公开 CLI 和 `pixifact/compiler-node` 入口，并纳入 release version 同步。
- 已把真实 tarball 仓库外验收接入本地 `release:check` 和 npm publish workflow。
- 当前源码 tarball 已完整通过 Agent 主命令链、项目构建和 Editor 启动验收。

Current State:
- 本计划已完成。

Currently Failing:
- 无。

Next:
1. 下次发布时运行 `bun run release:check`，通过后再 version / tag / publish。
