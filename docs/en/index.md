# Pixifact English Docs

Status: Active
Authority: Entry point, navigation, and ownership for public English Pixifact documentation
Upstream: [../../README.en.md](../../README.en.md), [../index.md](../index.md)
Downstream: [./layout.md](./layout.md), [./scene-objects.md](./scene-objects.md), [./agent-scene-authoring.md](./agent-scene-authoring.md), [./runtime-agent.md](./runtime-agent.md), [./wechat-minigame.md](./wechat-minigame.md)
Update rule: Update when public English docs are added, moved, archived, or README links change.

[中文](../zh/index.md)

## Start Here

If you are new to Pixifact, read:

1. [README](../../README.en.md)
2. [Layout](./layout.md)
3. [Scene Objects](./scene-objects.md)
4. [Agent Scene Authoring](./agent-scene-authoring.md)
5. [WeChat Mini Game Builds](./wechat-minigame.md)

If you want an external AI agent to edit a downstream game project, read:

1. [Agent Scene Authoring](./agent-scene-authoring.md)
2. [Scene Objects](./scene-objects.md)
3. [Layout](./layout.md)
4. [Agent Runtime](./runtime-agent.md)

If you are maintaining this repository, start from [Internal Docs](../../internal-docs/index.md).

## Active Docs

| Document | Responsibility |
| --- | --- |
| [Layout](./layout.md) | Design resolution, viewport adaptation, frame layout, layout containers, and editor layout behavior |
| [Scene Objects](./scene-objects.md) | `.scene` object tags, common props, object-specific props, use cases, and examples |
| [Agent Scene Authoring](./agent-scene-authoring.md) | Rules, contracts, and validation boundaries for external agents editing `.scene` directly |
| [Agent Runtime](./runtime-agent.md) | Runtime setup, CLI, and boundaries for external agents observing and operating a Vite Web game |
| [WeChat Mini Game Builds](./wechat-minigame.md) | WeChat target config, platform runtime, resource delivery, CLI, and output boundary |

## Authority

- Product overview belongs to [README](../../README.en.md).
- Layout protocol, design resolution, viewport modes, and Layout Inspector behavior belong to [Layout](./layout.md).
- `.scene` object tags, object props, and object usage guidance belong to [Scene Objects](./scene-objects.md).
- Agent `.scene` editing workflow belongs to [Agent Scene Authoring](./agent-scene-authoring.md).
- Live game observation and input workflow belongs to [Agent Runtime](./runtime-agent.md).
- WeChat Mini Game support, configuration, and build boundaries belong to [WeChat Mini Game Builds](./wechat-minigame.md).
- Repository maintenance, testing, release, plans, and historical specs belong to [Internal Docs](../../internal-docs/index.md).
