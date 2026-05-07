# Pixifact Editor-first Plan

本文档记录项目重新定位后的执行计划。历史上 `PLAN.md` 主要跟踪 pixifact runtime 的框架收敛；从现在开始，本项目以编辑器产品为核心。

完整产品设计和阶段计划见：

```txt
AI_FIRST_GAME_EDITOR_PLAN.md
```

## 1. 当前项目定义

Pixifact 是 AI-first 游戏 UI / 轻量玩法编辑器。

项目中心：

```txt
apps/editor/
```

底层能力：

```txt
src/
```

`src/` 中的 runtime、Prefab、Command、EditorDocument、AI proposal、LogicGraph、ActionRegistry 等能力都应服务编辑器闭环：

```txt
Prompt -> Command / Proposal -> Validate -> Repair -> Apply -> Preview -> Export / Import
```

当前结构边界：

```txt
src/editor/    EditorDocument、AI context、diff、memory、logic 等编辑器领域模型
src/commands/  EditorCommand validate / apply / undo
src/prefab/    PrefabSpec、DSL、模板和 runtime instantiate
src/core/      PixiJS runtime foundation
src/ui/        runtime UI 组件
```

## 2. 已完成的底座

- [x] PixiJS v8 runtime foundation：`Application`、`GameObject`、`Group`、渲染叶子、组件生命周期。
- [x] 布局能力：`Layout`、`GridLayout`、`FlexGroup` / `Flex`。
- [x] UI runtime 组件：`Button`、`ScrollView`、`Input`、`Textarea` 等。
- [x] PrefabSpec / NodeSpec / ComponentSpec。
- [x] Command validate / apply / diff。
- [x] EditorDocument 作为项目 source of truth。
- [x] Runtime preview 从 PrefabSpec 实例化真实 runtime tree。
- [x] Alpha editor shell、Inspector、Hierarchy、AI proposal、Project import/export。
- [x] Mock AI server 和真实 gateway adapter 样例。
- [x] Playwright Alpha 主流程测试。
- [x] 包管理器统一迁移到 Bun。

## 3. 新优先级

### 3.1 Editor Product First

- [ ] `apps/editor/` 的正式 UI 以 `apps/editor-dockview-prototype/` 为交互基准。
- [ ] 文件系统、Prefab 节点树、Viewport、Inspector、AI 对话是首屏核心。
- [ ] 不再把 examples 或 runtime showcase 当作项目主入口。
- [ ] 文档、技能和 agent 规则默认围绕 editor 工作流组织。

### 3.2 AI Send-and-Execute

- [ ] AI 面板从 proposal 审核器收敛为对话式发送入口。
- [ ] 用户不再手动点击“生成 / 预演 / 应用”完成主流程。
- [ ] 内部保留 command validation、repair loop、错误轨迹和 undo。
- [ ] 错误反馈给 AI 自动修正，达到上限后再向用户解释失败原因。

### 3.3 Project File Workflow

- [ ] 文件系统面板成为项目入口。
- [ ] 双击 Prefab 在编辑器内打开。
- [ ] 双击图片使用系统图片查看器。
- [ ] 双击代码跳转 VS Code。
- [ ] Component 文件可拖到 Inspector 挂载。
- [ ] 编辑器不直接修改 TypeScript 源码文件。

### 3.4 Runtime As Infrastructure

- [x] `pixifact/editor`、`pixifact/commands`、`pixifact/prefab` 作为 editor-first 领域入口。
- [ ] 新 runtime API 必须服务 editor、Prefab、preview、command 或 export。
- [ ] 避免为了“通用框架完整性”新增不被 editor 使用的抽象。
- [ ] Runtime 示例只用于验证底层能力，不定义产品方向。

## 4. 验证策略

编辑器相关改动优先：

```bash
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
bun run test
bun run editor:build
```

Alpha 主流程改动：

```bash
bun run editor:e2e
```

Runtime / package-entry 改动：

```bash
bun run build
bun run example:build
```

## 5. 历史说明

旧版框架计划中的核心模型、ticker 生命周期、布局、ScrollView、发布配置和 UI 组件稳定性已经完成，作为 editor runtime foundation 继续保留。后续不再用这些条目定义项目目标。
