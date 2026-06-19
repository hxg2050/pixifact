# Changesets

记录需要发布的变更：

```bash
bun run changeset
```

准备发布版本：

```bash
bun run release:version
```

发布前检查：

```bash
bun run release:check
```

推送 tag 触发 GitHub Actions Trusted Publishing：

```bash
bun run release:publish
```
