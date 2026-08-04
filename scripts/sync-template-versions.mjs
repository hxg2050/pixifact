#!/usr/bin/env bun
import { readFile, writeFile } from 'node:fs/promises';

const packageFiles = {
    pixifact: 'packages/pixifact/package.json',
    pixifactCli: 'packages/pixifact-cli/package.json',
    template: 'packages/create-pixifact/templates/minimal/package.json',
    adventureDemo: 'sample-projects/adventure-ui-demo/package.json',
};

async function readJson(file) {
    return JSON.parse(await readFile(file, 'utf8'));
}

async function writeJson(file, value) {
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

const pixifactPackage = await readJson(packageFiles.pixifact);
const pixifactCliPackage = await readJson(packageFiles.pixifactCli);
const templatePackage = await readJson(packageFiles.template);
const adventureDemoPackage = await readJson(packageFiles.adventureDemo);

templatePackage.dependencies.pixifact = `^${pixifactPackage.version}`;
templatePackage.devDependencies['pixifact-cli'] = `^${pixifactCliPackage.version}`;
adventureDemoPackage.dependencies.pixifact = `^${pixifactPackage.version}`;
adventureDemoPackage.devDependencies['pixifact-cli'] = `^${pixifactCliPackage.version}`;

await writeJson(packageFiles.template, templatePackage);
await writeJson(packageFiles.adventureDemo, adventureDemoPackage);

console.log(`Synced downstream project manifests to pixifact@^${pixifactPackage.version} and pixifact-cli@^${pixifactCliPackage.version}.`);
