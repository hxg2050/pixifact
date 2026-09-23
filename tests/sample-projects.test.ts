import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { describe, expect, it } from 'vitest';

const repoRoot = cwd();
const wechatSampleRoot = join(repoRoot, 'sample-projects', 'wechat-minigame-demo');
const starSampleRoot = join(repoRoot, 'sample-projects', 'star-game-demo');

async function exists(filePath: string) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

describe('sample projects', () => {
    it('keeps the sample projects discoverable', async () => {
        const sampleProjectDirectories = await readdir(join(repoRoot, 'sample-projects'), { withFileTypes: true });
        expect(sampleProjectDirectories.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort())
            .toEqual(['star-game-demo', 'wechat-minigame-demo']);
    });

    it('keeps the playable Web sample as a Scene and script pair', async () => {
        const project = JSON.parse(await readFile(join(starSampleRoot, 'pixifact.project.json'), 'utf8'));
        expect(project).toMatchObject({
            resolution: { width: 750, height: 1334 },
            scenes: { main: 'src/scenes/Main.scene' },
            resourcePacks: ['demo-level'],
        });
        await expect(exists(join(starSampleRoot, 'src', 'scenes', 'Main.scene'))).resolves.toBe(true);
        await expect(exists(join(starSampleRoot, 'src', 'scenes', 'Main.ts'))).resolves.toBe(true);
        await expect(exists(join(starSampleRoot, 'src', 'main.ts'))).resolves.toBe(true);
    });

    it('keeps the unified sample importable by both Mini Game developer tools', async () => {
        const project = JSON.parse(await readFile(join(wechatSampleRoot, 'pixifact.project.json'), 'utf8'));
        expect(project).toMatchObject({ version: 2, resourcePacks: ['demo-level'] });
        expect((await readFile(join(wechatSampleRoot, 'bunfig.toml'), 'utf8')).replaceAll('\r\n', '\n')).toBe('env = false\n');
        await expect(exists(join(wechatSampleRoot, 'platforms', 'wechat', 'game.json'))).resolves.toBe(true);
        await expect(exists(join(wechatSampleRoot, 'platforms', 'wechat', 'project.config.json'))).resolves.toBe(true);
        await expect(exists(join(wechatSampleRoot, 'platforms', 'douyin', 'game.json'))).resolves.toBe(true);
        await expect(exists(join(wechatSampleRoot, 'platforms', 'douyin', 'project.config.json'))).resolves.toBe(true);
        await expect(exists(join(wechatSampleRoot, 'src', 'scenes', 'Main.scene'))).resolves.toBe(true);
        await expect(exists(join(wechatSampleRoot, 'src', 'scenes', 'Main.ts'))).resolves.toBe(true);
        await expect(exists(join(wechatSampleRoot, 'src', 'main.ts'))).resolves.toBe(true);
        await expect(exists(join(wechatSampleRoot, 'src', 'wechat', 'main.ts'))).resolves.toBe(false);
        await expect(exists(join(wechatSampleRoot, 'src', 'douyin', 'main.ts'))).resolves.toBe(false);
    });
});
