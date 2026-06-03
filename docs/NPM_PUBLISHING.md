# npm Publishing

Pixifact publishes three public npm packages:

- `pixifact`
- `pixifact-cli`
- `create-pixifact`

Publish order matters:

1. `pixifact`
2. `pixifact-cli`
3. `create-pixifact`

`pixifact-cli` depends on `pixifact`. `create-pixifact` scaffolds projects that depend on both.

## Current Release State

The first npm release has been completed:

- npm packages: `0.1.3`
- git tag: `v0.1.3`
- GitHub release: <https://github.com/hxg2050/pixifact/releases/tag/v0.1.3>
- release notes source: [`docs/releases/v0.1.3.md`](./releases/v0.1.3.md)

The first release was published manually because npm Trusted Publishing requires the package to already exist before trust can be configured.

Trusted Publishing has since been configured from the npm website for all three packages.

## Local Auth For Manual Publishing

Use the official npm registry for all publish commands:

```bash
npm whoami --registry https://registry.npmjs.org/
```

If npm requires two-factor authentication and no authenticator app is available, create a granular publish token on npmjs.com with:

- package publish permission
- minimal package scope
- an expiration date
- 2FA bypass enabled

Store the token outside the repository. A local `~/.npmrc` entry is acceptable for manual publishing:

```ini
//registry.npmjs.org/:_authToken=npm_xxx
```

Do not paste npm tokens into chat, commit them, or add a long-lived `NPM_TOKEN` secret for the normal release path. Revoke broad temporary tokens after use.

## Preflight Checklist

Run these checks before any manual publish:

```bash
npm whoami --registry https://registry.npmjs.org/
bun run test
bun run build
cd packages/create-pixifact && bun run build && cd ../..
```

Check package contents and publish simulation:

```bash
for dir in packages/pixifact packages/pixifact-cli packages/create-pixifact; do
  (
    cd "$dir"
    npm pack --dry-run --json
    npm publish --dry-run --registry https://registry.npmjs.org/
  )
done
```

Also verify package names and versions before publishing:

```bash
npm view pixifact version --registry https://registry.npmjs.org/
npm view pixifact-cli version --registry https://registry.npmjs.org/
npm view create-pixifact version --registry https://registry.npmjs.org/
```

An `E404` before the first release means the package name is not yet published.

## Manual Publish

Publish in dependency order:

```bash
cd packages/pixifact
npm publish --registry https://registry.npmjs.org/

cd ../pixifact-cli
npm publish --registry https://registry.npmjs.org/

cd ../create-pixifact
npm publish --registry https://registry.npmjs.org/
```

If npm returns a 2FA error, either provide a current 6-digit authenticator OTP with `--otp <code>` or use a granular publish token with 2FA bypass enabled. Recovery codes are not publish OTPs.

## Post-Publish Verification

Confirm that npm registry sees the expected versions:

```bash
npm view pixifact version --registry https://registry.npmjs.org/
npm view pixifact-cli version --registry https://registry.npmjs.org/
npm view create-pixifact version --registry https://registry.npmjs.org/
```

Run a real install smoke test from a temporary directory:

```bash
tmp="$(mktemp -d)"
cd "$tmp"
bun create pixifact npm-smoke
cd npm-smoke
bun install
bun run build
```

The build should compile Scenes and complete a Vite production build. A Vite chunk-size warning is acceptable for the current scaffold.

## Git Tag And GitHub Release

After package versions are committed:

```bash
git tag v0.1.3
git push origin main
git push origin v0.1.3
```

Create or update the GitHub release:

```bash
gh release create v0.1.3 --title "Pixifact v0.1.3" --notes-file docs/releases/v0.1.3.md
```

If the release already exists, update it instead:

```bash
gh release edit v0.1.3 --title "Pixifact v0.1.3" --notes-file docs/releases/v0.1.3.md
```

## Configure Trusted Publishing

After the packages exist, configure each package to trust the GitHub Actions workflow:

- repository: `hxg2050/pixifact`
- workflow filename: `publish.yml`
- permission: allow publish

Using the npm website:

1. Open each package on npmjs.com.
2. Go to package settings.
3. Add a GitHub Actions trusted publisher.
4. Use repository `hxg2050/pixifact`.
5. Use workflow filename `publish.yml`.
6. Allow `npm publish`.

Using npm CLI 11.10.0 or newer:

```bash
npm install -g npm@^11.10.0
npm login --registry https://registry.npmjs.org/

npm trust github pixifact --repo hxg2050/pixifact --file publish.yml --allow-publish
npm trust github pixifact-cli --repo hxg2050/pixifact --file publish.yml --allow-publish
npm trust github create-pixifact --repo hxg2050/pixifact --file publish.yml --allow-publish
```

If `npm trust github ...` returns `E403` while the current user is still listed as package owner, configure the trusted publisher from the npm website package settings instead. This can happen even when `--dry-run` succeeds.

After configuration, you can try to list trusted publishers:

```bash
npm trust list pixifact
npm trust list pixifact-cli
npm trust list create-pixifact
```

If `npm trust list ...` also returns `E403`, confirm the configuration from the npm website. The final end-to-end verification is the next tag release successfully publishing through GitHub Actions OIDC.

Trusted Publishing uses GitHub Actions OIDC. Do not add a long-lived `NPM_TOKEN` secret for the normal release path.

The workflow is `.github/workflows/publish.yml`. It runs when a `v*.*.*` tag is pushed and uses:

- `permissions.id-token: write`
- Bun 1.3.13
- Node 24
- npm 11
- `actions/setup-node` with `package-manager-cache: false`

The workflow checks that the tag version matches:

- `packages/pixifact/package.json`
- `packages/pixifact-cli/package.json`
- `packages/create-pixifact/package.json`

If a package version is already published, the workflow skips it. This makes reruns safe after partial failures.

## Next Release Checklist

1. Update all package versions together.
2. Update release notes under `docs/releases/`.
3. Run the preflight checklist.
4. Commit version and release-note changes.
5. Tag `vX.Y.Z`.
6. Push `main` and the tag.
7. Let Trusted Publishing handle npm once it is configured, or run the manual publish flow.
8. Run post-publish verification.
9. Create or update the GitHub release.
