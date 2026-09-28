# Release Install Smoke Plan

## Goal

2026-09-28 续作：让 `create-pixifact` 默认初始化 Git 并安装项目级 Pixifact skill；把真实脚手架 tarball 纳入仓库外验收。

2026-09-29 发布续作：发布五包 `0.16.0`，交付默认 Git / skill、项目脚本及上次发布后的 Editor 布局约束控件。

建立一个使用当前仓库真实 npm tarball 的仓库外验收链路，确保外部 Agent 获得 `adventure-ui-demo` 后，可以只通过公开包入口完成 Scene 发现、检查、校验、编译、项目构建和 Editor 启动验证。

## Decisions

- `0.16.0` 使用 minor Changesets，五个公开包按 fixed group 同版发布；本地生成版本并提交，推送 tag 后由 GitHub Actions 完成完整验证与 Trusted Publishing。
- 新项目默认执行 `git init`，不创建首次提交、不配置 remote；缺少 Git 时直接报告命令错误。
- 生成 `.gitignore`，忽略依赖、构建、Pixifact 缓存和本机 env；项目 skill 纳入可跟踪源文件。
- skill 安装到 `.agents/skills/pixifact/`，完整复制 `skills/pixifact/` 的正文、agents metadata 和离线 references。
- 构建时复用现有 skill 安装脚本，将权威源复制进 `create-pixifact/dist/skills` 随包分发；不维护第二份手写 skill，不修改用户全局安装。
- 源码开发从仓库 `skills/pixifact` 读取；发布入口从自身 `dist/skills/pixifact` 读取，不依赖创建者的源码仓库。
- 验收必须把 `pixifact` 和 `pixifact-cli` 打包后安装到仓库外临时目录，不能直接执行仓库源码入口。
- `adventure-ui-demo` 必须使用 `pixifact`、`pixifact/compiler-node` 和 `pixifact` CLI 等正式公开入口，不能引用 `../../packages/**`。
- 发布验收使用当前 tarball，不依赖 npm registry 上可能滞后的版本。
- Editor 验收只确认 CLI 能启动服务且首页可访问，随后主动停止进程；不做浏览器 UI 功能测试。
- 验收脚本必须自动清理临时目录，不在仓库中留下 tarball、安装目录或生成产物。
- 该验收进入 `release:check`，成为发布前门禁。

## Non-Goals

- 2026-09-28 的实现不发布 npm 包；2026-09-29 用户已授权发布，按正常流程推送 tag 并创建 GitHub Release。
- 不修改 `.scene` 语法、Compiler 语义或 Editor 产品功能。
- 不处理微信小游戏示例的独立安装链路。
- 不为旧版 npm 包增加兼容层。

## Public API / User-Facing Behavior

- `bun create pixifact my-game` 完成后，项目拥有独立 Git 仓库、`.gitignore` 和项目级 Pixifact skill；终端提示安装结果。
- `sample-projects/adventure-ui-demo` 改为使用公开 CLI 和 `pixifact/compiler-node`，复制到仓库外后可安装真实包并运行。
- CLI 命令本身不新增或修改公开参数。

## Implementation Scope

- 扩展脚手架初始化与 build，补齐源码测试和真实 tarball 生成项目验收，并同步包 README 和根 README。
- 增加仓库外 tarball 安装与命令链路验收脚本。
- 调整 `adventure-ui-demo` 的 package scripts、Vite config 和 TypeScript config，移除 monorepo 源码相对路径。
- 将示例依赖版本纳入 release version 同步。
- 更新发布检查、测试和相关维护文档。

## Test Plan

2026-09-29 发布验证：检查版本与依赖同步、lockfile 和差异；完整测试、构建和 tarball 验收由 tag workflow 执行，发布后核对五包 registry 与 GitHub Release。

2026-09-28 续作验证：

1. 源码测试覆盖 Git 初始化、嵌套项目独立仓库、ignore 行为、全部 skill 文件内容以及 Git 不可用时的失败。
2. 构建 `create-pixifact`，检查 tarball 包含完整 skill。
3. 在仓库外安装真实脚手架 tarball，生成项目并检查 Git 与 skill。

原有下游安装验收：

1. 先新增静态测试，要求示例不再包含 `../../packages/**` 或 `workspace:*`，并使用公开 CLI / compiler-node 入口。
2. 先直接运行仓库外验收脚本，记录当前失败位置。
3. 完成最小实现后运行：
   - `rtk bunx --no-install vitest run tests/sample-projects.test.ts tests/create-pixifact.test.ts`
   - `rtk bun run build`
   - `rtk bun run editor:frontend:build`
   - `rtk bun scripts/check-release-install.mjs`
   - `rtk bun run test`

## Verification

- 2026-09-29：Changesets 已生成五包 `0.16.0`，同步内部依赖与模板版本；`bun install --frozen-lockfile --dry-run`、`bun run editor:typecheck` 和 `git diff --check` 通过，`bun.lock` 无改动。
- 2026-09-28：`bunx --no-install vitest run tests/create-pixifact.test.ts` 通过，6 项测试覆盖原有生成行为和默认 Git / skill。
- 2026-09-28：`packages/create-pixifact` 的 `bun run build` 通过，skill 由仓库权威源复制到发布产物。
- 2026-09-28：`bun scripts/check-release-install.mjs` 全部通过；真实脚手架 tarball 在仓库外安装并生成独立 Git 仓库和完整 skill，原有 Web / Editor / 微信 / 抖音验收也通过。
- 2026-08-04 通过 `rtk bunx --no-install vitest run tests/sample-projects.test.ts tests/create-pixifact.test.ts`，共 2 个测试文件、7 项测试。
- 2026-08-04 通过 `rtk bun scripts/check-release-install.mjs`：真实 tarball 在仓库外完成安装、CLI help、summary、inspect、validate、compile-scenes、Vite build 和 Editor HTTP 验收。
- 2026-08-04 通过 `rtk bun run release:check`：共 17 个测试文件、229 项测试，并完成全部发布构建与检查。

## Progress

- [ ] 2026-09-29：生成 `0.16.0`、提交并推送 tag，确认 workflow、npm 五包和 GitHub Release。
- [x] 2026-09-28：完成默认 Git / skill 的实现、源码测试和 tarball 验收。
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

Last updated: 2026-09-29

Done:
- 2026-09-29：已核对待发布提交，完成五包 `0.16.0` 版本、changelog 和发布前本地最小检查。
- 2026-09-28：默认 Git 初始化、`.gitignore`、项目级 skill、构建打包和真实 tarball 生成项目验收已完成。
- 已完成独立外部 Agent 评估。
- 已确认现有发布检查只执行 `npm pack --dry-run`，没有安装并运行 tarball。
- 已确认 `adventure-ui-demo` 的 package scripts、Vite config、tsconfig 和 workspace 依赖仍耦合 monorepo。
- 已将示例切换到公开 CLI 和 `pixifact/compiler-node` 入口，并纳入 release version 同步。
- 已把真实 tarball 仓库外验收接入本地 `release:check` 和 npm publish workflow。
- 当前源码 tarball 已完整通过 Agent 主命令链、项目构建和 Editor 启动验收。

Current State:
- `0.16.0` 发布变更已准备好，待提交并推送 tag；npm 最新仍为 `0.15.0`。

Currently Failing:
- 无。

Next:
1. 提交发布变更，推送 `main` 和 `v0.16.0`，等待发布 workflow。
2. 成功后核对 registry、创建 Release 并更新发布状态。
