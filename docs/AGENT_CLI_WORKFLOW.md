# Agent CLI Workflow

本文档定义外部 Agent 使用 Pixifact CLI 修改 Scene 的固定流程。目标是让 Agent 可以高效工作，同时保持 `SceneDocument` 和 `SceneCommand` 作为唯一受控修改路径。

## 1. 不可变规则

- 不直接编辑 `.scene` 或 `pixifact.aiEditorProject` JSON。
- 不把 Zustand、React state 或 editor UI state 当项目数据源。
- 不生成旧 MCP 请求或旧协议 payload。
- 不创建兼容层、别名、fallback 或 deprecation shim。
- 所有真实修改必须表达为 `SceneCommand[]`。
- apply 前必须先 dry-run。

## 2. 文件模式流程

文件模式用于修改磁盘上的项目文件，不要求 editor 已启动。

```bash
bun run pixifact -- summary --project-root /path/to/project
```

选择目标 Scene 后读取完整上下文：

```bash
bun run pixifact -- scene get \
  --project-root /path/to/project \
  --scene scenes/main.scene
```

需要细看节点时：

```bash
bun run pixifact -- node inspect \
  --project-root /path/to/project \
  --scene scenes/main.scene \
  --node submitButtonLabel
```

生成 `commands.json` 后先预演：

```bash
bun run pixifact -- commands dry-run \
  --project-root /path/to/project \
  --scene scenes/main.scene \
  --commands commands.json
```

只有 dry-run 返回 `ok: true` 后才能应用：

```bash
bun run pixifact -- commands apply \
  --project-root /path/to/project \
  --scene scenes/main.scene \
  --commands commands.json
```

## 3. Live Editor 流程

Live mode 用于操作当前打开的 editor Scene。先确认 editor 已启动并打开目标 Scene。

读取当前 Scene：

```bash
bun run pixifact -- live scene get
```

检查节点：

```bash
bun run pixifact -- live node inspect --node submitButtonLabel
```

预演：

```bash
bun run pixifact -- live commands dry-run --commands commands.json
```

应用：

```bash
bun run pixifact -- live commands apply --commands commands.json
```

Live apply 成功后会刷新 editor preview，并保存当前打开的 Scene。

## 4. 命令生成规范

Agent 生成的 `commands.json` 必须是数组：

```json
[
  {
    "op": "setNodeData",
    "node": "submitButtonLabel",
    "field": "text",
    "prop": "value",
    "value": "Continue"
  }
]
```

常用命令：

- `setTransform`：修改节点位置和尺寸。
- `setNodeData`：修改 text / image / input / shape 的显示数据。
- `createNode`：创建公开 Scene 节点。
- `deleteNode`：删除节点。
- `addComponent`：添加行为组件。
- `setComponentProp`：修改组件参数。
- `batch`：把一组命令作为单个行为单元提交。

## 5. Locator 规则

- 节点优先使用 `key`。
- 没有 `key` 时使用 `id`。
- 组件使用 `id`。
- 文件使用 project-relative path，例如 `assets/login.scene`。
- 不依赖节点显示名作为主要定位方式，除非该节点没有 `key` / `id`。

## 6. 失败处理

如果 dry-run、validate 或 apply 失败：

1. 读取错误 JSON 中的 `error`、`commandIndex`、`op`、`node`、`target`、`hint` 和 `results`。
2. 不直接改文件。
3. 用 `commandIndex` 定位失败命令，用 `target` 判断失败字段或父子关系。
4. 重新读取 Scene 或 inspect 相关节点。
5. 根据 `hint` 修正 `SceneCommand[]`。
6. 再次 dry-run。

典型失败：

- `Node "..." was not found.`：locator 错误或上下文过期。
- `Only container nodes can contain child nodes.`：把子节点挂到了非 container 节点。
- `Node data prop "..." does not exist`：字段不属于该节点类型。
- `filePath must stay inside projectRoot.`：scene 路径越界。

## 7. 推荐提示模板

给外部 Agent 的任务可以使用下面的格式：

```txt
使用 Pixifact CLI 修改当前 Scene。
先运行 summary / scene get 获取上下文。
如果需要定位节点，运行 node inspect。
生成 SceneCommand[]，保存为 commands.json。
必须先 commands dry-run，只有 ok: true 后才能 commands apply。
不要直接编辑 .scene JSON。
```
