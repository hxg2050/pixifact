# pixifact-cli

## 0.8.0

### Minor Changes

- 新增 `pixifact runtime screenshot`，可捕获已注册 PixiJS Application 的 Canvas PNG；省略 `--output` 时默认写入项目根下 `.pixifact/runtime/frame.png`。

### Patch Changes

- Updated dependencies
  - pixifact@0.8.0

## 0.7.0

### Minor Changes

- d4e052a: 统一 Web、微信和抖音的 Vite 构建链、单入口、mode/env 与 PixiJS Assets 资源加载，并将微信和抖音 Runtime 拆为按需安装的平台包。

### Patch Changes

- Updated dependencies [d4e052a]
  - pixifact@0.7.0

## 0.6.1

### Patch Changes

- 8e06992: 修复浏览器 Editor 在颜色选择器关闭后把十六进制颜色草稿写成数字、进而产生错误颜色和重复提交的问题。
- 0dccb73: 修复浏览器 Editor Inspector 漏掉 `left`、`right`、`top`、`bottom`、`horizontal` 和 `vertical` 可选布局属性的问题。
- c28a27a: 调整浏览器 Editor Inspector 的字段布局，按语义分区展示属性，将 `x/y` 等相关数值字段合并到同一行，并让字段名与输入控件保持横向排列。
  - pixifact@0.6.1

## 0.6.0

### Minor Changes

- 3bc36d6: 新增 `pixifact editor screenshot --output <png-path>`，通过当前活动浏览器的 Authoring Preview 输出设计尺寸 PNG；新增 Agent Runtime 观测、标准输入和 `runtime tree --output <json-path>` 节点树快照；同时明确 Compiler locator 来源并精简 `scene validate --all` 的成功输出。

### Patch Changes

- Updated dependencies [3bc36d6]
  - pixifact@0.6.0

## 0.5.0

### Minor Changes

- 发布 AI-first Scene authoring 闭环：浏览器 Editor、Scene Binding、Label / BitmapLabel、只读 Editor context、外部文件同步、画布与层级编辑，以及真实 npm tarball 的下游项目发布验收。

### Patch Changes

- Updated dependencies
  - pixifact@0.5.0

## 0.4.0

### Minor Changes

- 00ca569: 新增微信小游戏一等构建目标、平台 runtime、Scene 跨平台资源 manifest、资源分包与远程 delivery、目标校验、开发监听、文档和完整示例项目；Scene 运行时 API 迁移到 `pixifact/scene`。微信构建兼容缺少 `Intl`、`navigator`、`TextEncoder` 和 `TextDecoder` 的真机运行时，并支持拖动所需的全局 pointer move 事件。

### Patch Changes

- Updated dependencies [00ca569]
  - pixifact@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [e21b1b9]
  - pixifact@0.3.0

## 0.2.2

### Patch Changes

- pixifact@0.2.2

## 0.2.1

### Patch Changes

- 更新 AI-first CLI 主路径、Scene authoring 文档和 Pixifact skill 离线参考。
- Updated dependencies
  - pixifact@0.2.1

## 0.2.0

### Minor Changes

- 发布 runtime 布局与资源节点更新：新增 Rect、Image、NineImage、TileImage、ScrollContainer、GridContainer 和栈布局容器，补充 viewport 适配能力，改进 Scene 尺寸、节点移动/缩放和示例项目体验。

### Patch Changes

- Updated dependencies
  - pixifact@0.2.0

## 0.1.5

### Patch Changes

- 修复 Editor 预览使用裸 Group 作为根节点导致 Scene action 找不到脚本方法的问题，并修复层级面板右键添加节点子菜单 hover 空隙。
- Updated dependencies
  - pixifact@0.1.5

## 0.1.4

### Patch Changes

- 2820b52: 简化 monorepo 发布流程，并让 create-pixifact 生成的 Scene 默认继承 Group。
- Updated dependencies [2820b52]
  - pixifact@0.1.4
