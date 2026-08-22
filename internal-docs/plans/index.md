# Plans

状态：活跃
权威范围：实现计划、历史决策和续作记录的目录入口
上游文档：[../index.md](../index.md)
下游文档：本目录内计划文件
更新规则：新增计划、完成计划或计划状态变化时更新

## 当前计划

| 文档 | 负责什么 |
| --- | --- |
| [unified-vite-platform-build.md](./unified-vite-platform-build.md) | Web、微信、抖音单入口、可选平台包、统一 Vite 构建与 Pixi Assets 资源链路 |
| [runtime-observation-v1.md](./runtime-observation-v1.md) | 真实 Vite Web 游戏的 Runtime tree、state、logs、input 与 CLI 观测闭环 |
| [editor-vnext.md](./editor-vnext.md) | 浏览器 Editor vNext 的产品边界、数据流、实现范围和续作记录 |
| [scene-binding.md](./scene-binding.md) | Scene 静态 Prop、Variant、声明式绑定、Runtime 构造与 Editor Authoring 预览 |
| [release-v0.9.0.md](./release-v0.9.0.md) | 简化 Scene 创建命令和资产树展开状态持久化的五包 `0.9.0` 发布 |
| [release-v0.8.0.md](./release-v0.8.0.md) | Runtime Canvas 截图与 Vite 8 路径修复的五包 `0.8.0` 发布 |

继续 Editor vNext 时，先读取对应计划的 `Resume Notes`，不要从旧 Tauri Editor 或归档工作台方案重新推导产品边界。

## 已完成计划

| 文档 | 负责什么 |
| --- | --- |
| [release-v0.11.0.md](./release-v0.11.0.md) | Editor 素材定位与预览节点选择改进的五包 `0.11.0` 发布 |
| [release-v0.7.0.md](./release-v0.7.0.md) | `0.7.0` 五个公开 npm 包的发布准备与验证 |
| [douyin-image-loading.md](./douyin-image-loading.md) | 抖音小游戏冷启动图片解码时序与 PixiJS Assets loader 修复 |
| [release-install-smoke.md](./release-install-smoke.md) | 真实 npm tarball 的仓库外安装、CLI、构建和 Editor 发布前验收 |
| [adventure-ui-demo.md](./adventure-ui-demo.md) | 示例项目计划 |
| [viewport-adaptation-v1.md](./viewport-adaptation-v1.md) | 视口适配第一版 |
| [scroll-container-runtime.md](./scroll-container-runtime.md) | ScrollContainer runtime |
| [grid-container-runtime.md](./grid-container-runtime.md) | GridContainer runtime |
| [image-runtime-nodes.md](./image-runtime-nodes.md) | Image / NineImage / TileImage runtime |
| [rect-runtime-node.md](./rect-runtime-node.md) | Rect runtime |
| [label-runtime-node.md](./label-runtime-node.md) | Label / BitmapLabel 文本盒、排版语义、compiler 与 Editor 接入 |
| [runtime-behavior-activation.md](./runtime-behavior-activation.md) | Runtime 节点视觉构造、游戏行为激活与 Editor Authoring Preview 安全边界 |
| [documentation-split.md](./documentation-split.md) | 对外文档和内部文档分层迁移 |
| [documentation-foundation.md](./documentation-foundation.md) | README、文档入口和 Layout 文档整理 |
| [public-docs-i18n.md](./public-docs-i18n.md) | 对外文档中英文目录拆分 |

## 使用规则

计划文件记录任务级决策、验证方式和续作入口。实现完成后，当前行为应沉淀到活跃文档，例如 [../../docs/zh/layout.md](../../docs/zh/layout.md) 或 [../../docs/zh/agent-scene-authoring.md](../../docs/zh/agent-scene-authoring.md)。
