# npm Publishing

Pixifact publishes three public npm packages:

- `pixifact`
- `pixifact-cli`
- `create-pixifact`

The GitHub Actions workflow is `.github/workflows/publish.yml`. It runs when a `v*.*.*` tag is pushed and publishes the packages in dependency order.

## First Publish

npm Trusted Publishing requires the package to already exist on the npm registry before configuring trust. For the first release, publish once from a local authenticated npm session:

```bash
npm login
npm whoami

cd packages/pixifact
npm publish

cd ../pixifact-cli
npm publish

cd ../create-pixifact
npm publish
```

## Configure Trusted Publishing

After the packages exist, configure each package to trust this GitHub Actions workflow.

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
npm login

npm trust github pixifact --repo hxg2050/pixifact --file publish.yml --allow-publish
npm trust github pixifact-cli --repo hxg2050/pixifact --file publish.yml --allow-publish
npm trust github create-pixifact --repo hxg2050/pixifact --file publish.yml --allow-publish
```

Trusted Publishing uses GitHub Actions OIDC. Do not add a long-lived `NPM_TOKEN` secret for the normal release path.

The workflow uses:

- `permissions.id-token: write`
- Node 24
- npm 11
- `actions/setup-node` with `package-manager-cache: false`

These match npm's Trusted Publishing requirements for GitHub Actions.

## Release

Update all package versions first:

```bash
bun run test
bun run build
cd packages/create-pixifact && bun run build && cd ../..
```

Commit the version changes, then tag and push:

```bash
git tag v0.1.3
git push github main
git push github v0.1.3
```

The workflow checks that the tag version matches:

- `packages/pixifact/package.json`
- `packages/pixifact-cli/package.json`
- `packages/create-pixifact/package.json`

If a package version is already published, the workflow skips it. This makes reruns safe after partial failures.
