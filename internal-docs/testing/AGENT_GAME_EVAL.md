# Agent 游戏开发评测

状态：活跃
权威范围：使用 Web 可玩示例衡量外部 Agent 完成 Pixifact 游戏开发任务的能力
上游文档：[./index.md](./index.md)、[../../sample-projects/star-game-demo/README.md](../../sample-projects/star-game-demo/README.md)
更新规则：固定任务、验收标准或记录指标变化时更新

## 目的与基线

评测对象是外部 coding agent 完成用户需求的结果，不是 Pixifact 内置 Agent。每个任务从同一版本的 `sample-projects/star-game-demo` 独立副本开始；记录 Pixifact 版本、Agent、模型与任务开始时的提交。不要把上一题的实现带入下一题。用户只给下面的任务原文和仓库已有文档，不提供实现提示。

基线游戏已经有开始、正确点击得分、错误点击扣机会、胜负与重开；`runtime state` 暴露 `phase`、`score`、`lives`、`target`。评测人先确认基线能在 Web 开发模式运行，再交给 Agent。

## 固定任务

### E1：Scene 表现

> 在“追星九宫格”的得分区增加 8 格可视化进度。每得 1 分点亮 1 格，重开时清零。保留现有数字得分和全部玩法。使用 Pixifact 的 `.scene` 作为视觉结构源文件。

验收：准备状态 0 格亮；连续命中后亮格数等于得分；获胜时 8 格全亮；重开后归零。当前界面仍能完整显示，数字得分与 Runtime 状态一致。

### E2：行为规则

> 把规则改为“连续点错两次才失去一次机会”。点中目标会清除连续点错计数。界面要让玩家知道当前是否已经点错一次；失败后仍能重开。其他规则保持原样。

验收：第一次错点不扣机会，第二次连续错点扣 1 次；一次正确点击能清除累计的错点；机会耗尽后显示失败；重开后累计状态清零。视觉反馈与 Runtime 状态一致。

### E3：完整新机制

> 为每局游戏增加 20 秒倒计时。开始后计时，时间耗尽且尚未获胜时判负；获胜或失败时停止计时；重开恢复 20 秒。界面显示剩余秒数，开发期 Runtime 状态也能读取剩余秒数。

验收：开始前显示 20 秒；开始后递减；时间耗尽进入失败；胜负结束后数值停止；重开后恢复 20 秒，原有点击、得分、机会逻辑仍可用。

## 每题验证

Agent 应运行 Scene 校验、编译和最小相关测试。评测人在 Agent 结束后独立运行：

```bash
bun packages/pixifact-cli/src/pixifact-cli.ts scene validate --all --project-root <任务副本>
bun packages/pixifact-cli/src/pixifact-cli.ts compile-scenes --project-root <任务副本>
bunx --no-install tsc --noEmit -p <任务副本>/tsconfig.json
```

随后启动 Web 开发服务，通过 `runtime state`、`runtime input click`、`runtime screenshot` 和浏览器画面走完各题验收步骤。记录实际截图、最终代码 diff 和失败输出。构建发布产物与小游戏平台不属于本轮评测。

## 结果记录

每次运行复制下表一行。`通过` 只有在任务对应的全部验收项、Scene 校验、编译、类型检查和 Web 实测都通过时记为 1；其余记为 0。修复轮次是 Agent 第一次运行验证失败后再次修改的次数；人工介入是评测人额外给出提示或修改代码的次数。

| 基线提交 | Agent / 模型 | 任务 | 通过 0/1 | 耗时 | 修复轮次 | 人工介入 | 失败证据或截图 |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
|  |  | E1 / E2 / E3 |  |  |  |  |  |

同一基线与同一任务至少重复三次，再比较完成率、中位耗时、修复轮次和人工介入。发现反复出现的失败后，先定位是 Scene 表达、诊断、运行观测还是示例文档的问题，再决定修改 Pixifact 的哪一层。
