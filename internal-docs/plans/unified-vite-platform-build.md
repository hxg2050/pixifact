# Unified Vite Platform Build

状态：计划中
最后更新：2026-08-10

## Goal

将 Pixifact 的 Web、微信小游戏、抖音小游戏收敛为一套 Vite 构建链、一份 `src/main.ts` 和一套 PixiJS Assets 加载心智。微信和抖音 Runtime 拆为可选安装包，平台选择来自 Vite mode 对应 env 文件中的 `VITE_PLATFORM`，不再维护独立入口、`--target`、全局宏、直接 esbuild builder 或第二套资源加载 API。

完成后，下游项目应能通过同一组命令构建三端：

```bash
pixifact validate --mode game1
pixifact dev --mode game1
pixifact build --mode game1
```

其中 `.env.game1` 是标准 Vite mode 文件：

```ini
VITE_PLATFORM=wechat
VITE_APP_ID=abc123
```

## Decisions

### Platform and package boundaries

- Web、微信、抖音共享一份 `src/main.ts`；不再支持 `targets.<platform>.entry`。
- Vite 是三端唯一构建引擎。小游戏构建不再直接调用 esbuild；esbuild 或 Oxc 只作为 Vite 内部实现存在。
- 微信和抖音拆为可选公开包：
  - `@pixifact/platform-wechat`
  - `@pixifact/platform-douyin`
- Web implementation 保留在 `pixifact/platform/web`，不增加 `@pixifact/platform-web`。
- 构建期虚拟模块 `pixifact:platform` 只绑定当前 `VITE_PLATFORM` 对应实现：
  - `web` -> `pixifact/platform/web`
  - `wechat` -> `@pixifact/platform-wechat`
  - `douyin` -> `@pixifact/platform-douyin`
- 删除 `pixifact/platform/wechat` 和 `pixifact/platform/douyin` 公开入口，不保留 alias、fallback、deprecation shim 或兼容导出。
- 小游戏平台共用实现继续由 `pixifact` 所有，官方平台包通过 support-only 的 `pixifact/internal/minigame` 子路径复用；不新增第三个公开平台包。
- 两个平台包将 `pixifact` 和 `pixi.js` 声明为 peer dependencies，加入 Changesets fixed group，并设置 `publishConfig.access: "public"`。
- 平台包模块顶层不得读取 `wx`、`tt`、注册生命周期或执行平台初始化。Pixi extension 注册也必须推迟到 `createApplication()` 调用阶段。
- 平台包使用精确的 `sideEffects` 声明；最终 bundle 隔离测试是正确性的权威，不以 package metadata 本身代替验证。

### Application API

- 三个平台统一导出：

```ts
import type {
  Application,
  ApplicationOptions,
} from 'pixi.js';

declare function createApplication(
  options?: Partial<ApplicationOptions>,
): Promise<Application>;
```

- `createPlatformApplication`、`createWechatPixiApplication`、`createDouyinPixiApplication` 直接删除。
- 参数和返回值复用 PixiJS 类型，不新增 `PlatformApplicationOptions` 或自定义 Application facade。
- 小游戏平台拥有 `canvas`、`context`、运行时尺寸和 adapter 等必需字段；其他 PixiJS options 透传给 `Application.init()`。
- `createApplication()` 只准备平台环境并创建 Pixi `Application`，不隐式调用 `Assets.init()`。
- 分享、登录、震动、广告等真正的平台专属能力直接从对应平台包静态导入，不为它们设计公共最低公分母 facade。
- 使用平台专属 API 的源码必须安装对应平台包；非目标 production bundle 必须通过常量折叠和 tree-shaking 删除对应代码。

### Env, mode, and CLI

- 完全遵循 Vite env 文件和 mode 规则，不实现 Pixifact 专属 env 文件解析或叠加顺序：
  - `.env`
  - `.env.local`
  - `.env.[mode]`
  - `.env.[mode].local`
- `--mode` 接受任意非空 Vite mode，并原样传给 Vite；例如 `--mode game1` 加载 `.env.game1`。
- `VITE_PLATFORM` 是平台选择唯一 source of truth，合法值只有 `web | wechat | douyin`。
- 删除 `--target`、`PIXIFACT_PLATFORM`、`__PIXIFACT_PLATFORM__`、`__PIXIFACT_MODE__`、`__PIXIFACT_MINIGAME__` 和 `pixifact.project.json` 中的 `defines`。
- 用户变量遵循 Vite `VITE_` 前缀规则，值保持字符串语义；不新增 boolean / number 自动解析。
- `import.meta.env.MODE` 保持 Vite mode，例如 `game1`；`DEV` / `PROD` 保持 Vite / `NODE_ENV` 语义。
- `VITE_APP_ID` 是微信和抖音原生 AppID 的唯一来源；小游戏 validate/build 缺少时失败，Web 忽略该字段。
- Pixifact 使用 Vite `loadEnv()` 读取 mode，不自己解析 dotenv。执行测试必须覆盖 Bun 预加载 `.env` 对 Vite 优先级的影响。
- CLI 默认 mode 与 Vite 对齐：`dev` 默认 `development`，`build` 和 `validate` 默认 `production`；显式 `--mode` 覆盖默认值。
- CLI 不自动安装平台包。缺少当前平台包时让 Vite 模块解析失败，并在 CLI 输出中保留可执行的安装命令。

### Vite ownership

- 下游 `vite.config.ts` 是唯一构建配置入口，使用一个公开插件入口：

```ts
import { defineConfig } from 'vite';
import { pixifact } from 'pixifact/compiler-node';

export default defineConfig({
  plugins: [pixifact()],
});
```

- `pixifact()` 返回一组职责独立的 Vite 插件，而不是一个持有全部状态的单体插件。
- Vite 负责：config 加载、env/mode、模块解析、TypeScript 转换、tree-shaking、静态资源、hash、minify、sourcemap、watch、outDir 清理和产物生命周期。
- Pixifact Vite 插件负责：Scene 编译、虚拟模块、平台选择、Pixi manifest、资源包输出、小游戏原生配置生成和包体校验。
- Web `dev` 使用 Vite `createServer()`；Web `build` 和小游戏 production 使用 `vite.build()`；小游戏 `dev` 使用 Vite build watch。
- 不使用 Vite 8 experimental `createBuilder` 多环境 API；一次命令只构建一个 `VITE_PLATFORM`。
- Web 保持标准 `index.html` 入口；小游戏构建以 `src/main.ts` 为无 HTML input。
- 小游戏 Vite invariants 由插件拥有：`appType: 'custom'`、单个 `game.js`、IIFE、inline dynamic imports、无 module preload、平台 ECMAScript target、正确 banner 和不内联受管资源。
- 默认输出目录为 `dist/<platform>`；用户确有需要时通过 `vite.config.ts` 的 `build.outDir` 修改，`pixifact.project.json` 不重复保存。
- 默认项目入口为 `src/main.ts`；小游戏特殊 input 通过 Vite config 修改，`pixifact.project.json` 不重复保存。
- 输出目录删除交给 Vite `emptyOutDir`，但 Pixifact 仍保留 outDir 必须位于项目内且不得包含输入源的 destructive-path guard。
- Scene/resource/native config 通过 Vite plugin `addWatchFile` 纳入 watch，不再递归监听整个项目并自行 debounce。
- 受管文件通过 Vite/Rolldown `emitFile` 进入产物，包体报告从 `generateBundle` / `writeBundle` 产物计算，不再构建后递归扫描输出目录。
- `pixifactRuntimePlugin` 仍是 Web 开发观测的显式 opt-in 插件，不因统一构建而默认启用。

### Project conventions and schema

- `pixifact.project.json` 升级为 breaking schema version 2，不解析 version 1，不提供迁移 fallback。
- 配置只保留 Pixifact 领域语义：name、resolution、viewport、scenes、resource packs 和既有 run/editor 语义。
- 删除 `targets`、target entry、configDir、outDir 和 per-target resource delivery。
- 采用以下默认目录约定：
  - 应用入口：`src/main.ts`
  - Web HTML：`index.html`
  - 资源包：`resources/<pack-name>/`
  - 微信原生配置：`platforms/wechat/`
  - 抖音原生配置：`platforms/douyin/`
  - 默认输出：`dist/<platform>/`
- `resourcePacks` 的已确认本地形式为名称数组：

```json
{
  "version": 2,
  "name": "Game",
  "scenes": {
    "main": "src/scenes/Main.scene"
  },
  "resourcePacks": [
    "demo-level"
  ]
}
```

- pack 名同时是 Pixi bundle 名；目录固定为 `resources/<pack-name>/`。
- 未列入 resource pack 的 Scene 纹理属于主资源图；任意业务 JSON、音频、字体等若需要 bundle / 分包语义，应放入 resource pack。
- 微信和抖音原生 `game.json` / `project.config.json` 继续作为用户可维护模板；Pixifact 构建时生成输出副本，写入 AppID 和受管分包声明，不修改源模板。
- 用户不能在原生模板中重复维护由 Pixifact 生成的 resource pack 分包声明；出现冲突时 validation 报告单一来源冲突。

### Assets and resource loading

- 用户只使用 PixiJS `Assets`：

```ts
import { Assets } from 'pixi.js';
import manifest from 'pixifact:assets';

await Assets.init({ manifest });
await Assets.load('resources/demo-level/level.json');
await Assets.loadBundle('demo-level');
```

- `pixifact:assets` 是 target-aware 的只读虚拟模块，默认导出符合 PixiJS manifest 类型的数据，不导出 loader 函数，也不产生顶层初始化副作用。
- 用户在 `createApplication()` 完成后的合适时机调用一次 `Assets.init({ manifest })`；Pixifact 不隐式初始化。
- 逻辑路径统一使用无前导 `/` 的项目相对路径。Vite/Pixifact 负责映射到 Web URL、小游戏主包路径、分包路径或 HTTPS URL。
- 本地 resource pack 在 Web 中是 Pixi bundle，在微信/抖音中是 Pixi bundle + 资源分包；业务代码不调用 `loadSubpackage()`。
- 小游戏 fetch adapter 在 Pixi Assets 真正读取分包路径前自动加载对应分包，复用现有并发去重与失败后可重试语义。
- JSON、纹理、字体、音频等继续使用 PixiJS parser/loader，不新增 `loadProjectResource()`、`fetchProjectResource()` 或同义 wrapper。
- `fetchWechatResource`、`fetchDouyinResource`、`loadWechatSubpackage`、`loadDouyinSubpackage` 退回平台包内部支持能力，不再从包根公开。
- Scene compiler 生成的 texture prepare 直接调用 `Assets.load<Texture>(logicalPath)`；删除公开的 `configureSceneAssets()` 和 `loadSceneTexture()`，不保留兼容导出。
- Vite 普通资源使用 `?url` 和 asset graph；本地资源包通过插件 emit 并保持包内相对结构，避免 bitmap font 等相对引用因 hash 改名失效。
- Vite build manifest 不能替代 `pixifact:assets`：前者描述模块产物，后者描述 Pixi alias、bundle、远程位置和分包准备信息。

### Remote resource decision gate

- 现有 HTTPS remote resource pack 能力必须保留；本次迁移不负责上传 CDN，但必须继续生成逻辑路径到 HTTPS URL 的 manifest。
- 已确认的 `resourcePacks: string[]` 只能表达 pack membership，不能表达某个 pack 的 remote `baseUrl`。
- 进入资源实现阶段前必须在本计划中确认唯一 schema。推荐方案是在 version 2 增加根级映射，避免恢复 per-target 重复配置：

```json
{
  "resourcePacks": [
    "common",
    "demo-level"
  ],
  "remoteResourcePacks": {
    "common": "https://cdn.example.com/common"
  }
}
```

- 推荐语义：`remoteResourcePacks` 必须引用已声明 pack；列入映射的 pack 在所有平台使用 HTTPS URL，不进入 Web 或小游戏产物；其他 pack 在 Web 由 Vite emit，在小游戏成为分包。
- 在用户确认该 schema 或替代方案前，Phase 4 不开始；其他阶段可先执行。

## Non-Goals

- 不实现微信或抖音开发者工具自动上传、预览、审核和发布。
- 不实现登录、分享、广告、支付、开放数据域等平台 SDK facade。
- 不自动安装、卸载或修改用户的平台包依赖。
- 不维护旧 `--target`、旧三个入口、旧平台包路径、旧 project schema 或旧资源 API 的兼容层。
- 不为 env 文件增加 Pixifact 专属文件名、优先级、插值或类型转换。
- 不把密钥写入 `VITE_*`；所有进入客户端 bundle 的 env 都视为公开信息。
- 不用 Vite `publicDir` 代替 Pixifact 受管资源图；普通用户自有静态文件仍可按 Vite 原生方式使用 `publicDir`。
- 不把 Vite build manifest 当成 Pixi Assets manifest。
- 不在本次迁移中采用 Vite experimental multi-environment builder。
- 不改变 `.scene` 是 source of truth、Editor authoring 安全边界或 Runtime observation opt-in 行为。
- 不新增一个抽象的全平台分享/登录/震动接口。

## Public API / User-Facing Behavior

### Installation

Web-only project:

```bash
bun add pixifact pixi.js
bun add -d pixifact-cli vite
```

Wechat project additionally installs:

```bash
bun add @pixifact/platform-wechat
```

Douyin project additionally installs:

```bash
bun add @pixifact/platform-douyin
```

同时构建微信和抖音时安装两个平台包。平台包被 bundle 到游戏产物，因此放 dependencies；CLI 和 Vite 放 devDependencies。

### Entry

```ts
import { Assets } from 'pixi.js';
import { createApplication } from 'pixifact:platform';
import manifest from 'pixifact:assets';

const app = await createApplication({
  backgroundColor: 0x09111a,
});

await Assets.init({ manifest });
await Assets.loadBundle('demo-level');
```

平台专属 API 使用静态 import + env 常量分支：

```ts
import { configureShare } from '@pixifact/platform-wechat';

if (import.meta.env.VITE_PLATFORM === 'wechat') {
  configureShare();
}
```

`configureShare` 仅用于展示 import 规则，本次不新增该具体 API。

### TypeScript client types

- 提供 `pixifact/client` 类型入口，声明：
  - `pixifact:platform`
  - `pixifact:assets`
  - `ImportMetaEnv.VITE_PLATFORM`
  - 可选的 `ImportMetaEnv.VITE_APP_ID`
- 项目模板的 `src/vite-env.d.ts` 同时引用 `vite/client` 和 `pixifact/client`。
- 用户自定义 `VITE_*` 类型继续遵循 Vite 官方 `vite-env.d.ts` augmentation，不由 Pixifact扫描 env 文件生成类型。

### Commands

```bash
pixifact validate [--mode <vite-mode>]
pixifact dev [--mode <vite-mode>]
pixifact build [--mode <vite-mode>]
```

- `validate` 解析同一 Vite config/env/project schema，检查平台依赖、Scene、资源、原生模板和 AppID，但不写构建产物。
- `dev` 对 Web 启动 Vite server，对小游戏启动 Vite build watch，并返回实际输出目录。
- `build` 生成当前 mode 对应平台的 production 产物和报告。
- `compile-scenes` 仍保留为 Agent/CI 可显式调用的 Scene 命令；常规 dev/build 不再要求先运行它。

## Implementation Scope

### Phase 0: Lock behavior with failing tests

- 在 `internal-docs/testing/BDD.md` 增加统一 mode/platform/build/resource 的用户场景。
- 扩展 `tests/project-run-config.test.ts` 覆盖 version 2、固定目录和旧 targets schema 删除。
- 扩展 `tests/pixifact-cli.test.ts` 覆盖 `--mode`、`VITE_PLATFORM`、`VITE_APP_ID`、默认 mode 和 `--target` 删除。
- 新增或重组 Vite 构建集成测试，先证明：
  - 一个 `src/main.ts` 可分别构建三端。
  - `.env.game1` 由 Vite默认规则加载。
  - 非目标平台代码不出现在 bundle。
  - Scene/resource/config 变化触发 watch rebuild。
- 测试 fixture 使用临时项目和真实 Vite API，不 mock Vite 核心行为。

### Phase 1: Split platform packages and normalize Application

- 新增 `packages/platform-wechat/` 和 `packages/platform-douyin/`。
- 将平台 facade、types、input、lifecycle、fetch、subpackage、application 从 `packages/pixifact/src/platform/<platform>/` 迁移到对应包。
- 将共用小游戏能力收敛到 `pixifact/internal/minigame`，删除旧 core platform export。
- 新增 `pixifact/platform/web`。
- 将三个 create factory 统一为 `createApplication()` 并返回 Pixi `Application`。
- 将 Pixi side-effect extension 初始化移动到 create call 内部，保证未调用平台 API 时模块 import 安全。
- 更新 runtime mock 测试，验证 destroy 清理 ticker、input、lifecycle、renderer 和 stage。
- 增加包根静态 import 在缺少 `wx` / `tt` 环境下安全的测试。

### Phase 2: Introduce the unified Vite plugin

- 在 `packages/pixifact/src/compiler-node/` 增加 `pixifact()` plugin factory。
- 将现有 `pixifactScenesPlugin` 迁入 plugin group；常规 dev/build 在 `buildStart` 自动 `compileScenes()`。
- 为 `.scene`、配对脚本、resource pack 和平台模板注册 Vite watch dependencies。
- 实现 `pixifact:platform` resolve/load 与类型声明。
- 使用 Vite config hook 设置平台默认值，使用 `configResolved` 获取最终 root/outDir/mode。
- 使用 Vite stable API 替换小游戏 esbuild options、loader、banner、minify、sourcemap 和 target 配置。
- Web CLI dev 调用 `createServer()`；小游戏 dev 使用 `build.watch` 并桥接 built/error report。
- 删除 `packages/pixifact-cli/src/miniGameTarget.ts` 中的直接 esbuild build、recursive `fs.watch`、debounce/queue、手工 loader map、手工 output cleanup。
- 从 `pixifact-cli` 删除直接 esbuild dependency，并将 Vite作为 CLI/plugin 所需 peer/runtime dependency按实际模块解析验证后固定。

### Phase 3: Migrate CLI and project schema

- 将 `validate/build/dev` 分发从 `--target` 改为 `--mode` + `VITE_PLATFORM`。
- 使用 Vite `loadEnv()` 解析 mode；不引入 dotenv 依赖。
- 实现 `VITE_PLATFORM` 值校验和 `VITE_APP_ID` mini target 校验。
- 将 `pixifact.project.json` parser/summary 升级到 version 2，删除 targets 相关类型、parser 和校验。
- 应用固定目录约定，并从最终 Vite config读取 entry/outDir override。
- 微信/抖音原生模板从 `platforms/<platform>/` 读取；输出副本写入 AppID。
- 更新 CLI help、JSON result、错误提示和 dev session close 行为。
- 更新 Editor/project summary 对 version 2 的读取，但不改变 Editor UI 数据边界。

### Phase 4: Converge resources on PixiJS Assets

- 先完成 `Remote resource decision gate`。
- 实现 `pixifact:assets` 虚拟模块及 `pixifact/client` 类型。
- 从 project config 和 Scene compiler asset references 生成 target-aware Pixi manifest。
- 为每个 resource pack 生成同名 Pixi bundle。
- 普通 Vite资源使用 `?url`；本地 pack 通过 plugin emit 保持相对目录；remote pack 只生成 HTTPS URL。
- 生成微信 `subpackages` / 抖音 `subPackages`，并为 asset-only subpackage emit `game.js`。
- 将 subpackage root -> pack name 映射注入 mini fetch adapter，实现首次读取前自动 load、并发去重、失败重试。
- 修改 Scene TypeScript compiler 直接生成 Pixi `Assets.load()`。
- 删除 `sceneAssetRuntime.ts` 公开入口、旧 fetch/subpackage 根导出和相关文档心智。
- 将包体报告和限制校验接入 Vite output bundle；确保 source map 和 developer-only config 不计入平台限制。

### Phase 5: Migrate scaffold, sample, and docs

- `sample-projects/wechat-minigame-demo/` 合并为 `src/main.ts`，增加标准 Vite mode env files。
- 示例安装两个可选平台包，静态导入平台专属示例代码并验证非目标产物 tree-shaking。
- 示例资源统一改为 `Assets.init/load/loadBundle`，删除手动 fetch 和 loadSubpackage。
- 示例 scripts 统一为 `pixifact validate/dev/build --mode ...`，删除预先 `compile-scenes` 和分平台 builder scripts。
- `create-pixifact` 模板使用 `pixifact()`、单入口、version 2 project config 和 `pixifact/client` 类型。
- 更新中文优先文档及英文对应文档：README、CLI README、Web quick start、微信、抖音、资源加载、平台包安装、env/mode。
- 更新旧 Douyin plan 的真实设备状态，并将本计划设为后续架构事实来源。

### Phase 6: Release integration

- 将两个 scoped platform packages 加入 Changesets fixed group。
- 更新 `check-release-packages.mjs`、`check-release-install.mjs`、`publish-release-tag.mjs`、`sync-template-versions.mjs` 和 publish workflow。
- release install smoke 至少覆盖：
  - Web-only 项目不安装平台包仍能构建。
  - 只安装微信包可构建微信 mode，产物不含抖音代码。
  - 只安装抖音包可构建抖音 mode，产物不含微信代码。
  - 同时安装两个包可从同一 `main.ts` 构建两端。
- 为五个公开包检查 tarball 内容、peer dependencies、README、license、exports 和 public access。
- 添加 Changeset，并验证 version sync 不遗漏两个新包。

## Test Plan

### Project, env, and CLI

- [ ] version 2 project config 接受固定目录和 resource pack names，拒绝旧 targets schema。
- [ ] `--mode game1` 加载 `.env.game1`；`.env.game1.local` 和已有 process env 遵循 Vite优先级。
- [ ] Bun 启动 CLI 时不破坏 Vite mode-specific env 行为。
- [ ] `VITE_PLATFORM` 缺失或非法时 validate/dev/build 失败。
- [ ] Web 忽略 `VITE_APP_ID`；微信/抖音缺少 AppID 时失败，并将有效值写入输出配置。
- [ ] `--target` 不再出现在 CLI help 或 public command contract。

### Platform packages and Application

- [ ] 平台包 import 不读取 `wx` / `tt`，在非目标 dev module evaluation 中安全。
- [ ] `createApplication()` 返回原生 Pixi `Application`，options 透传符合契约。
- [ ] 微信/抖音 canvas、renderer、input、lifecycle 和 destroy cleanup 通过 runtime mock。
- [ ] 抖音 target 保持 ES2018，微信保持已验证 target；真实产物不出现目标不支持语法。
- [ ] 删除旧 platform exports 后，仓库内无旧 import。

### Vite build and tree-shaking

- [ ] Web、微信、抖音从同一 `src/main.ts` 构建成功。
- [ ] mini 输出单一 `game.js` IIFE，无 HTML 依赖、无运行时 dynamic import。
- [ ] Web bundle 不含微信/抖音 marker、`wx` / `tt` adapter 和包代码。
- [ ] 微信 bundle 不含抖音 marker；抖音 bundle 不含微信 marker。
- [ ] 静态 import 的平台专属函数在 env 常量 false 时从 production bundle 删除。
- [ ] 用户 `vite.config.ts` 的安全配置可生效；小游戏 invariant 不能被意外破坏。
- [ ] TS、Scene、resource pack、native config 改动由 Vite watch 触发正确重建，输出目录不会触发自循环。

### Pixi Assets and resource delivery

- [ ] `pixifact:assets` 导出 Pixi manifest，不执行 `Assets.init()`。
- [ ] `Assets.load()` 加载主包纹理和 JSON，`Assets.loadBundle()` 加载完整 pack。
- [ ] Scene-generated prepare 与业务资源共用同一 Assets resolver/manifest。
- [ ] 微信/抖音首次读取分包资源前自动 load subpackage；并发请求只调用一次平台 API。
- [ ] 分包加载失败后下一次请求可重试，不缓存 rejected promise。
- [ ] remote pack 映射 HTTPS URL 且不进入代码包；HTTP URL validation 失败。
- [ ] bitmap font、音频和关联资源保持包内相对路径。
- [ ] 生成的 `game.json` 使用微信 `subpackages` / 抖音 `subPackages` 正确字段。
- [ ] 主包、各分包、总包报告与输出字节一致，平台限制继续生效。

### Packaging and release

- [ ] Web-only tarball install 不拉取可选平台包。
- [ ] scoped packages 可公开 pack/publish，exports 与 types 完整。
- [ ] fixed group、version sync、publish workflow 和 release smoke 包含两个新包。
- [ ] create-pixifact 新项目可安装、validate、Web build，并能按需安装小游戏包。

### Manual acceptance

- [ ] Web 浏览器完成启动、Scene、Assets JSON/texture/bundle 和输入验证。
- [ ] 微信开发者工具模拟器及至少一台真机完成启动、WebGL、Text、Graphics、触摸、前后台恢复、主包和分包资源验证。
- [ ] 抖音开发者工具模拟器及至少一台真机完成同一矩阵，重点检查 ES2018 输出。
- [ ] 清理开发者工具缓存后复验，避免旧 `game.js` 造成假阳性或假阴性。

## Verification

最小相关测试按阶段运行，最终执行：

```bash
bunx --no-install vitest run \
  tests/project-run-config.test.ts \
  tests/pixifact-cli.test.ts \
  tests/wechat-target.test.ts \
  tests/douyin-target.test.ts \
  tests/wechat-platform-runtime.test.ts \
  tests/douyin-platform-runtime.test.ts \
  tests/scene-compiler.test.ts \
  tests/sample-projects.test.ts \
  tests/create-pixifact.test.ts

bun run test
bun run build
cd packages/create-pixifact && bun run build
cd ../..
bun run release:check
git diff --check
```

示例目标验证使用迁移后的 scripts，最终名称以实现时 package scripts 为准：

```bash
pixifact validate --mode web
pixifact build --mode web
pixifact validate --mode wechat
pixifact build --mode wechat
pixifact validate --mode douyin
pixifact build --mode douyin
```

## Commit Strategy

1. `test: define unified Vite platform behavior`
2. `feat: split optional mini game platform packages`
3. `refactor: unify platform builds on Vite`
4. `feat: route project resources through Pixi Assets`
5. `docs: migrate platform build and resource guides`
6. `chore: add platform packages to release workflow`

每个提交只包含对应阶段的 tracked 和任务所需新增文件；阶段验证通过后自动提交，不提交构建产物。

## Progress

- [x] 讨论并确认平台包、单入口、Vite、env/mode、Application 和 Assets 的目标契约。
- [x] 审计现有 esbuild builder、Vite plugin、资源 runtime、project schema 和 release scripts。
- [x] 创建实施计划。
- [ ] 确认 remote resource pack version 2 schema。
- [ ] Phase 0：行为测试。
- [ ] Phase 1：平台包拆分。
- [ ] Phase 2：统一 Vite plugin/build。
- [ ] Phase 3：CLI/env/project schema。
- [ ] Phase 4：Pixi Assets/resource delivery。
- [ ] Phase 5：sample/scaffold/docs。
- [ ] Phase 6：release integration。
- [ ] 完整自动化与开发者工具/真机验收。

## Resume Protocol

1. 阅读 `AGENTS.md`、`CODEX.md` 和本计划。
2. 检查 worktree，保留所有无关用户改动。
3. 阅读 `Resume Notes`，运行其中列出的最小目标测试。
4. 从 `Next` 第一项继续，不重新打开已确认 Decisions。
5. 开始 Phase 4 前先确认 `Remote resource decision gate`。
6. 每完成一个阶段，更新 Progress、Test Plan 和 Resume Notes。
7. 如果当前轮无法完成，记录 Done、Current State、Currently Failing 和 Next 后再停止。

## Resume Notes

Last updated: 2026-08-10

Done:
- 现有 Web、微信、抖音均已实现；抖音 ES2018 修复后的产物已由用户完成真机运行验证。
- 已确认目标包名 `@pixifact/platform-wechat` 和 `@pixifact/platform-douyin`。
- 已确认使用一份 `src/main.ts`、`pixifact:platform`、`createApplication()` 和可选平台包。
- 已确认三端统一 Vite，删除直接 esbuild builder 和手写 watch/hash/loader。
- 已确认 env 完全遵循 Vite mode 规则，以 `VITE_PLATFORM` 选择平台、`VITE_APP_ID` 生成小游戏配置，并删除 `--target` 和全局宏。
- 已确认用户显式 `Assets.init({ manifest })`，资源加载只使用 PixiJS `Assets.load/loadBundle`。
- 已确认默认目录约定、version 2 breaking migration 和不保留兼容入口。

Current State:
- 仅完成设计、现状审计和计划文档，尚未修改实现代码或测试。
- 当前仓库基线提交为 `a28f236 fix: target Douyin builds to ES2018`，计划创建前 worktree clean。
- `resourcePacks: string[]` 已确认用于本地 pack；HTTPS remote pack 的 version 2 配置仍需确认。

Currently Failing:
- 无已知仓库自动化失败。
- 本轮只编写计划，未运行测试或构建。

Next:
1. 用户确认 `Remote resource decision gate` 的推荐 schema，或给出替代结构。
2. 使用 change-workflow 从 Phase 0 开始，先写 version 2/env/Vite/tree-shaking 的失败测试。
3. 按 Commit Strategy 分阶段实现、验证和提交。
