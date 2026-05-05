import { expect, test } from '@playwright/test';

const remoteConfigStorageKey = 'pixif.editor.remoteConfig.v1';

test('AI-first editor alpha flow exports and imports full project state', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Pixif AI-first 游戏编辑器')).toBeVisible();
    await expect(page.getByTestId('viewport-stage')).toBeVisible();
    await expect(page.getByText('资源管理器')).toBeVisible();
    await expect(page.getByTestId('hierarchy-tree')).toContainText('按钮');

    await page.getByTestId('tab-left-assets').click();
    await expect(page.getByTestId('project-path')).toContainText('/Users/youxia/work/github/pixif');
    await expect(page.getByTestId('resource-explorer')).toContainText('脚本');
    await expect(page.getByTestId('resource-explorer')).toContainText('logic-handlers.ts');
    await expect(page.getByTestId('resource-explorer')).toContainText('submitLogin.ts');
    await expect(page.getByTestId('resource-explorer')).toContainText('useInventoryItem.ts');
    await expect(page.getByTestId('resource-explorer')).toContainText('默认按钮.ai-editor.json');
    await page.getByTestId('tab-left-hierarchy').click();

    await page.getByTestId('tab-ai').click();
    await page.getByTestId('ai-prompt').fill('创建一个背包界面，四列三行，每个格子有图标、数量和 Use 按钮。');
    await page.getByTestId('ai-generate').click();
    await expect(page.getByText('提案')).toBeVisible();
    await expect(page.getByText(/创建 inventoryPanel|创建 背包面板/)).toBeVisible();

    await page.getByTestId('ai-dry-run').click();
    await expect(page.getByTestId('ai-run-result')).toContainText('预演通过');

    await page.getByTestId('ai-apply').click();
    await expect(page.getByTestId('summary-bar')).toContainText('个节点');
    await page.getByRole('button', { name: /背包面板/ }).click();

    await page.getByTestId('tab-actions').click();
    await expect(page.getByText('useInventoryItem')).toBeVisible();

    await page.getByTestId('tab-logic').click();
    await page.getByTestId('logic-add-default').click();
    await expect(page.getByText('已添加默认背包逻辑流。')).toBeVisible();
    await expect(page.locator('.flowList')).toContainText('useInventoryItem');

    await page.getByRole('button', { name: /inventorySlot1/ }).first().click();
    await page.getByTestId('tab-inspector').click();
    const xInput = page.locator('[data-field-key="x"] input').first();
    await xInput.fill('20');
    await xInput.press('Enter');

    await page.getByTestId('tab-memory').click();
    await expect(page.getByRole('heading', { name: '建议' })).toBeVisible();
    await page.getByTestId('memory-accept').first().click();
    await expect(page.getByText('已接受记忆建议。')).toBeVisible();
    await expect(page.getByText('已保存记忆')).toBeVisible();

    await page.getByTestId('tab-project').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('project-export').click();
    const download = await downloadPromise;
    const exportedPath = await download.path();
    expect(exportedPath).toBeTruthy();

    await page.getByRole('button', { name: /inventorySlot1/ }).first().click();
    await page.getByTestId('tab-inspector').click();
    const importedNodeKey = page.locator('[data-field-key="key"] input').first();
    await importedNodeKey.fill('temporaryKeyBeforeImport');
    await importedNodeKey.press('Enter');
    await expect(page.getByText('temporaryKeyBeforeImport')).toBeVisible();

    await page.getByTestId('tab-project').click();
    await page.getByTestId('project-import-input').setInputFiles(exportedPath!);
    await expect(page.getByText(/已导入/)).toBeVisible();
    await expect(page.getByText('temporaryKeyBeforeImport')).toHaveCount(0);
    await expect(page.getByText('使用背包物品')).toBeVisible();
    await expect(page.getByText('状态')).toBeVisible();

    await page.getByTestId('tab-logic').click();
    await expect(page.getByText('Use Inventory Item')).toBeVisible();

    await page.getByTestId('tab-memory').click();
    await expect(page.getByText('已保存记忆')).toBeVisible();
    await expect(page.locator('.memoryItem')).toHaveCount(1);
});

test('AI-first editor shows failure states for invalid import and remote provider errors', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('tab-project').click();
    await page.getByTestId('project-import-input').setInputFiles({
        name: 'invalid.ai-editor.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({
            type: 'prefab',
            version: 1,
            name: 'Invalid',
        })),
    });
    await expect(page.getByText('无法导入 invalid.ai-editor.json')).toBeVisible();
    await expect(page.getByText(/type 的值不符合项目协议|type/)).toBeVisible();

    await page.getByTestId('tab-ai').click();
    await page.route('**/proposal', async (route) => {
        expect(route.request().headers().authorization).toBe('Bearer local-test');
        await route.fulfill({
            status: 500,
            contentType: 'text/plain',
            body: 'remote provider unavailable',
        });
    });
    await page.getByRole('button', { name: 'Remote' }).click();
    await page.getByTestId('ai-remote-endpoint').fill('/proposal');
    await page.getByTestId('ai-remote-timeout').fill('5000');
    await page.getByTestId('ai-remote-auth-header').fill('Authorization');
    await page.getByTestId('ai-remote-auth-token').fill('Bearer local-test');
    await expect(page.getByTestId('ai-remote-model-api')).toHaveValue('responses');
    await expect(page.getByTestId('ai-remote-model-endpoint')).toHaveValue('https://code.ylsagi.com/codex/v1/responses');
    await expect(page.getByTestId('ai-remote-model-name')).toHaveValue('gpt-5.5');
    await expect(page.getByTestId('ai-remote-model-reasoning-effort')).toHaveValue('medium');
    await expect(page.getByTestId('ai-remote-model-service-tier')).toHaveValue('fast');
    await page.getByTestId('ai-remote-model-token').fill('upstream-secret');
    await expect(page.getByText('Gateway 和 model 的 endpoint/header/model 会保存在本地浏览器；token 不保存，也不写入项目资产。')).toBeVisible();
    await page.getByTestId('ai-generate').click();
    await expect(page.getByText(/Remote AI provider failed with 500/)).toBeVisible();
});

test('AI-first editor runs a successful remote proposal through dry run and apply', async ({ page }) => {
    await page.goto('/');

    await page.route('**/proposal', async (route) => {
        const body = route.request().postDataJSON() as {
            protocol?: string;
            prompt?: string;
            model?: {
                api?: string;
                endpoint?: string;
                token?: string;
                model?: string;
                reasoningEffort?: string;
                serviceTier?: string;
                store?: boolean;
            };
        };
        expect(body.protocol).toBe('pixif.aiProposal.v1');
        expect(body.model).toMatchObject({
            api: 'responses',
            endpoint: 'https://code.ylsagi.com/codex/v1/responses',
            token: 'upstream-secret',
            model: 'gpt-5.5',
            reasoningEffort: 'medium',
            serviceTier: 'fast',
            store: false,
        });
        expect(route.request().headers().authorization).toBe('Bearer local-test');

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                proposal: {
                    id: 'remote-success-proposal',
                    prompt: body.prompt,
                    explanation: 'Remote gateway generated a safe text update.',
                    commands: [{
                        op: 'setComponentProp',
                        node: 'submitButtonLabel',
                        component: 'text',
                        prop: 'text',
                        value: 'Remote Start',
                    }],
                    annotations: [{
                        node: 'submitButtonLabel',
                        component: 'text',
                        prop: 'text',
                        message: '只更新按钮文字。',
                    }],
                    risks: [],
                },
            }),
        });
    });

    await page.getByTestId('tab-ai').click();
    await page.getByRole('button', { name: 'Remote' }).click();
    await page.getByTestId('ai-remote-endpoint').fill('/proposal');
    await page.getByTestId('ai-remote-timeout').fill('5000');
    await page.getByTestId('ai-remote-auth-header').fill('Authorization');
    await page.getByTestId('ai-remote-auth-token').fill('Bearer local-test');
    await expect(page.getByTestId('ai-remote-model-api')).toHaveValue('responses');
    await expect(page.getByTestId('ai-remote-model-endpoint')).toHaveValue('https://code.ylsagi.com/codex/v1/responses');
    await expect(page.getByTestId('ai-remote-model-name')).toHaveValue('gpt-5.5');
    await page.getByTestId('ai-remote-model-token').fill('upstream-secret');
    const storedRemoteConfig = await page.evaluate((key) => localStorage.getItem(key), remoteConfigStorageKey);
    expect(storedRemoteConfig).toContain('/proposal');
    expect(storedRemoteConfig).toContain('https://code.ylsagi.com/codex/v1/responses');
    expect(storedRemoteConfig).toContain('gpt-5.5');
    expect(storedRemoteConfig).toContain('responses');
    expect(storedRemoteConfig).toContain('medium');
    expect(storedRemoteConfig).toContain('fast');
    expect(storedRemoteConfig).toContain('Authorization');
    expect(storedRemoteConfig).toContain('5000');
    expect(storedRemoteConfig).not.toContain('Bearer local-test');
    expect(storedRemoteConfig).not.toContain('upstream-secret');
    await page.getByTestId('ai-prompt').fill('把主按钮文字改成 Remote Start。');
    await page.getByTestId('ai-generate').click();

    await expect(page.getByText('Remote gateway generated a safe text update.')).toBeVisible();
    await expect(page.getByText('submitButtonLabel.text.text = Remote Start')).toBeVisible();

    await page.getByTestId('ai-dry-run').click();
    await expect(page.getByTestId('ai-run-result')).toContainText('预演通过');
    await expect(page.getByTestId('ai-run-result')).toContainText('Remote Start');

    await page.getByTestId('ai-apply').click();
    await page.getByTestId('tab-inspector').click();
    await page.getByRole('button', { name: /标签/ }).click();
    await expect(page.locator('[data-field-key="text"] input').first()).toHaveValue('Remote Start');
});
