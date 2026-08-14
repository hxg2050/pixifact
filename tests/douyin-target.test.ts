import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    buildPixifactTarget,
    validatePixifactTarget,
} from '../packages/pixifact-cli/src/viteTarget';

const checkedInSampleRoot = path.join(process.cwd(), 'sample-projects', 'wechat-minigame-demo');
let fixtureRoot: string;
let sampleRoot: string;

beforeAll(async () => {
    fixtureRoot = await mkdtemp(path.join(process.cwd(), '.pixifact-douyin-target-'));
    sampleRoot = path.join(fixtureRoot, 'sample');
    await cp(checkedInSampleRoot, sampleRoot, { recursive: true });
});

afterAll(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
});

describe('Douyin Mini Game target', () => {
    it('builds the checked-in one-entry sample for Douyin', async () => {
        const validation = await validatePixifactTarget(sampleRoot, 'douyin');
        expect(validation.diagnostics).toEqual([]);

        const report = await buildPixifactTarget(sampleRoot, 'douyin');
        const gameJson = JSON.parse(await readFile(path.join(report.outputDirectory, 'game.json'), 'utf8'));
        expect(gameJson.subPackages).toEqual([{
            name: 'demo-level',
            root: 'subpackages/demo-level',
        }]);
        const bundle = await readFile(path.join(report.outputDirectory, 'game.js'), 'utf8');
        expect(bundle).toContain('DouyinMiniGame');
        expect(bundle).not.toContain('WeChatMiniGame');
        await expect(readFile(
            path.join(report.outputDirectory, 'subpackages/demo-level/level.json'),
            'utf8',
        )).resolves.toContain('demo-level');
    }, 30_000);

    it('evaluates the bundle before tt startup without browser globals', async () => {
        const report = await buildPixifactTarget(sampleRoot, 'douyin');
        const bundle = await readFile(path.join(report.outputDirectory, 'game.js'), 'utf8');
        const startupSentinel = new Error('canvas.getContext reached');
        const errors: unknown[][] = [];

        expect(bundle.startsWith('var Intl=globalThis.Intl||{}')).toBe(true);
        runInNewContext(bundle, {
            console: {
                error: (...args: unknown[]) => errors.push(args),
                info: () => undefined,
            },
            Intl: undefined,
            tt: {
                createCanvas() {
                    return {
                        getContext() { throw startupSentinel; },
                        height: 1,
                        width: 1,
                    };
                },
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(errors).toEqual([['[pixifact-douyin] Failed to start', startupSentinel]]);
    }, 30_000);
});
