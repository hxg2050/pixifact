# npm Publishing

Pixifact 发布三个公开 npm 包：

- `pixifact`
- `pixifact-cli`
- `create-pixifact`

发布顺序仍然是 `pixifact` -> `pixifact-cli` -> `create-pixifact`。仓库使用 Changesets 管版本和 changelog，使用 GitHub Actions Trusted Publishing 发布 npm 包。

## 当前发布状态

首个 npm 版本已经发布：

- npm packages: `0.1.3`
- git tag: `v0.1.3`
- GitHub release: <https://github.com/hxg2050/pixifact/releases/tag/v0.1.3>
- release notes source: [`docs/releases/v0.1.3.md`](./releases/v0.1.3.md)

Trusted Publishing 已经在 npm 网站为三个包配置完成。正常发布路径不需要本地 npm token。

## 日常变更

有需要进入 npm 版本的改动时，创建 changeset：

```bash
bun run changeset
```

按提示选择包和 semver 类型。当前三个发布包在 `.changeset/config.json` 中配置为 fixed group，因此会保持同版本发布。

## 准备发布

生成版本改动：

```bash
bun run release:version
```

这个命令会：

- 执行 `changeset version`
- 更新三个发布包版本
- 更新 `CHANGELOG.md`
- 删除已消费的 changeset 文件
- 同步 `packages/create-pixifact/templates/minimal/package.json` 中的 `pixifact` / `pixifact-cli` 版本
- 更新 `bun.lock`

检查生成结果：

```bash
git diff
```

提交 release commit：

```bash
git add .
git commit -m "Release vX.Y.Z"
```

## 发布前检查

```bash
bun run release:check
```

这个命令会运行：

- `bun run test`
- `bun run build`
- `bun run editor:frontend:build`
- `packages/create-pixifact` build
- 三个发布包的 `npm pack --dry-run --json`

## 触发发布

确保工作区干净后：

```bash
bun run release:publish
```

脚本会读取三个发布包版本，确认版本一致，然后：

- 创建 `vX.Y.Z` tag
- push `main`
- push tag

`.github/workflows/publish.yml` 会在 tag push 后自动验证、构建并通过 Trusted Publishing 发布 npm 包。如果某个包版本已经发布，workflow 会跳过该包，方便重跑。

## 发布后验证

确认 npm registry 看到新版本：

```bash
npm view pixifact version --registry https://registry.npmjs.org/
npm view pixifact-cli version --registry https://registry.npmjs.org/
npm view create-pixifact version --registry https://registry.npmjs.org/
```

做一次真实安装冒烟：

```bash
tmp="$(mktemp -d)"
cd "$tmp"
bun create pixifact npm-smoke
cd npm-smoke
bun install
bun run build
```

创建 GitHub Release：

```bash
gh release create vX.Y.Z --title "Pixifact vX.Y.Z" --notes-file packages/pixifact/CHANGELOG.md
```

如果需要更精简的 notes，可以从 Changesets 生成的 changelog 中复制本次版本段落到 `docs/releases/vX.Y.Z.md`，再用该文件创建 release。

## 手动发布应急

只有 Trusted Publishing 或 GitHub Actions 出故障时才本地手动发布。

先确认 npm 登录：

```bash
npm whoami --registry https://registry.npmjs.org/
```

如果 npm 要求 2FA，而没有 authenticator app，可以创建 granular publish token，开启 2FA bypass，并只授予需要的包发布权限。不要把 token 写入仓库或聊天记录。

手动发布顺序：

```bash
cd packages/pixifact
npm publish --registry https://registry.npmjs.org/

cd ../pixifact-cli
npm publish --registry https://registry.npmjs.org/

cd ../create-pixifact
npm publish --registry https://registry.npmjs.org/
```

如果 npm 返回 2FA 错误，使用当前 6 位 OTP：

```bash
npm publish --registry https://registry.npmjs.org/ --otp <code>
```
