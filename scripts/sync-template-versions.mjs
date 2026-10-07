#!/usr/bin/env bun
import { readFile, writeFile } from 'node:fs/promises';

const packageFiles = {
    pixifact: 'packages/pixifact/package.json',
    pixifactCli: 'packages/pixifact-cli/package.json',
    platformWechat: 'packages/platform-wechat/package.json',
    platformDouyin: 'packages/platform-douyin/package.json',
};
const templateFiles = ['minimal', 'game'].map((name) => `packages/create-pixifact/templates/${name}/package.json`);

async function readJson(file) {
    return JSON.parse(await readFile(file, 'utf8'));
}

async function writeJson(file, value) {
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

const pixifactPackage = await readJson(packageFiles.pixifact);
const pixifactCliPackage = await readJson(packageFiles.pixifactCli);
const platformWechatPackage = await readJson(packageFiles.platformWechat);
const platformDouyinPackage = await readJson(packageFiles.platformDouyin);
const nextPixifactMajor = Number(pixifactPackage.version.split('.')[0]) + 1;

for (const templateFile of templateFiles) {
    const templatePackage = await readJson(templateFile);
    templatePackage.dependencies.pixifact = `^${pixifactPackage.version}`;
    templatePackage.devDependencies['pixifact-cli'] = `^${pixifactCliPackage.version}`;
    await writeJson(templateFile, templatePackage);
}
pixifactCliPackage.dependencies.pixifact = `^${pixifactPackage.version}`;
platformWechatPackage.peerDependencies.pixifact = `>=${pixifactPackage.version} <${nextPixifactMajor}`;
platformDouyinPackage.peerDependencies.pixifact = `>=${pixifactPackage.version} <${nextPixifactMajor}`;

await writeJson(packageFiles.pixifactCli, pixifactCliPackage);
await writeJson(packageFiles.platformWechat, platformWechatPackage);
await writeJson(packageFiles.platformDouyin, platformDouyinPackage);

console.log(`Synced downstream manifests and platform peers to pixifact@^${pixifactPackage.version} and pixifact-cli@^${pixifactCliPackage.version}.`);
