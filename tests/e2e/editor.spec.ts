import { expect, test } from '@playwright/test';

const remoteConfigStorageKey = 'pixifact.editor.remoteConfig.v1';

test('editor restores dockview prototype layout and auto-applies AI commands', async ({ page }) => {
    await page.goto('/');

    const dockTab = (title: string) => page.locator('.dv-default-tab-content').filter({ hasText: new RegExp(`^${title}$`) });

    await expect(page.getByText('Pixifact Editor')).toBeVisible();
    await expect(dockTab('文件系统')).toBeVisible();
    await expect(dockTab('预制体')).toBeVisible();
    await expect(dockTab('Viewport')).toBeVisible();
    await expect(dockTab('Inspector')).toBeVisible();
    await expect(dockTab('AI 对话')).toBeVisible();
    await expect(page.getByTestId('resource-explorer')).toContainText('未打开文件夹');
    await expect(page.getByTestId('save-status')).toContainText('未打开项目文件夹');
    await expect(page.getByTestId('hierarchy-tree')).toContainText('按钮');

    await page.getByTestId('ai-prompt').fill('创建一个背包界面，四列三行，每个格子有图标、数量和 Use 按钮。');
    await page.getByTestId('ai-generate').click();
    await expect(page.getByTestId('ai-run-result')).toContainText('自动校验完成');
    await expect(page.getByTestId('ai-run-result')).toContainText('合法命令已应用到项目');
    await expect(page.getByTestId('summary-bar')).toContainText('个节点');

    await page.evaluate(() => {
        class MockFileHandle {
            readonly kind = 'file';
            content: string;

            constructor(readonly name: string, content: string) {
                this.content = content;
            }

            async getFile() {
                return new File([this.content], this.name);
            }

            async createWritable() {
                return {
                    write: async (content: string) => {
                        this.content = content;
                    },
                    close: async () => {},
                };
            }
        }

        class MockDirectoryHandle {
            readonly kind = 'directory';

            constructor(
                readonly name: string,
                private children: Array<MockDirectoryHandle | MockFileHandle>,
            ) {}

            async *entries(): AsyncIterableIterator<[string, MockDirectoryHandle | MockFileHandle]> {
                for (const child of this.children) {
                    yield [child.name, child];
                }
            }

            async getFileHandle(name: string, options?: { create?: boolean }) {
                const existing = this.children.find((child) => child.name === name);
                if (existing instanceof MockFileHandle) {
                    return existing;
                }
                const file = new MockFileHandle(name, '');
                if (options?.create) {
                    this.children.push(file);
                }
                return file;
            }

            async getDirectoryHandle(name: string, options?: { create?: boolean }) {
                const existing = this.children.find((child) => child.name === name);
                if (existing instanceof MockDirectoryHandle) {
                    return existing;
                }
                const directory = new MockDirectoryHandle(name, []);
                if (options?.create || !existing) {
                    this.children.push(directory);
                }
                return directory;
            }

            async removeEntry(name: string) {
                this.children = this.children.filter((child) => child.name !== name);
            }
        }

        const inventoryPrefab = JSON.stringify({
            name: 'InventoryPanel',
            root: {
                type: 'Group',
                name: '背包面板',
                key: 'inventoryRoot',
                transform: { width: 520, height: 420 },
                children: [],
            },
        });
        const hudPrefab = JSON.stringify({
            version: 1,
            type: 'prefab',
            name: 'HudPanel',
            root: {
                type: 'Group',
                name: 'HUD',
                key: 'hudRoot',
                transform: { width: 320, height: 80 },
                components: [
                    { id: 'hudBg', type: 'ui.RoundedRectGraphic', props: { color: 16777215, radius: 8 } },
                ],
                children: [
                    {
                        type: 'Group',
                        name: 'Score',
                        key: 'scoreLabel',
                        transform: { width: 120, height: 24 },
                        components: [
                            { id: 'scoreText', type: 'ui.TextGraphic', props: { text: 'Score', fontSize: 16 } },
                        ],
                    },
                ],
            },
        });

        const project = new MockDirectoryHandle('GameProject', [
            new MockDirectoryHandle('prefabs', [
                new MockFileHandle('InventoryPanel.prefab', inventoryPrefab),
                new MockFileHandle('HudPanel.prefab', hudPrefab),
            ]),
            new MockDirectoryHandle('scripts', [
                new MockDirectoryHandle('components', [
                    new MockFileHandle('ButtonBinding.ts', ''),
                ]),
            ]),
            new MockFileHandle('README.md', ''),
        ]);

        window.showDirectoryPicker = async () => project as unknown as FileSystemDirectoryHandle;
    });

    await page.getByRole('button', { name: '打开文件夹' }).click();
    await expect(page.getByTestId('save-status')).toContainText('项目文件树已读取');
    await expect(page.getByTestId('resource-explorer')).toContainText('GameProject');
    await expect(page.getByTestId('resource-explorer')).toContainText('InventoryPanel.prefab');
    await expect(page.getByTestId('resource-explorer')).toContainText('HudPanel.prefab');
    await expect(page.getByTestId('resource-explorer')).toContainText('ButtonBinding.ts');
    await expect(page.getByTestId('file-preview').getByRole('button', { name: '文件说明' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('file-preview').locator('.accordionPanel')).not.toHaveClass(/open/);
    await page.getByTestId('file-preview').getByRole('button', { name: '文件说明' }).click();
    await expect(page.getByTestId('file-preview').locator('.accordionPanel')).toHaveClass(/open/);
    await expect(page.getByTestId('project-file-section').getByRole('button', { name: /项目文件/ })).toHaveAttribute('aria-expanded', 'false');
    await page.getByTestId('project-file-section').getByRole('button', { name: /项目文件/ }).click();
    await expect(page.getByTestId('project-file-section').getByRole('button', { name: /项目文件/ })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('basic-component-library').getByRole('button', { name: '基础组件库' })).toHaveAttribute('aria-expanded', 'false');
    await page.getByTestId('basic-component-library').getByRole('button', { name: '基础组件库' }).click();
    await expect(page.getByTestId('project-file-section').getByRole('button', { name: /项目文件/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('basic-component-library')).toContainText('节点');
    await expect(page.getByTestId('basic-component-library')).toContainText('按钮');
    await expect(page.getByTestId('basic-component-library')).toContainText('文字');
    await expect(page.getByTestId('basic-component-library')).toContainText('图片');
    await expect(page.locator('[data-basic-component="button"]')).toBeVisible();
    await page.getByTestId('project-file-section').getByRole('button', { name: /项目文件/ }).click();
    await expect(page.getByTestId('basic-component-library').getByRole('button', { name: '基础组件库' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('basic-component-library').locator('.accordionPanel')).not.toHaveClass(/open/);

    await page.locator('[data-file-id="GameProject/prefabs/InventoryPanel.prefab"]').dblclick();
    await expect(page.getByTestId('hierarchy-tree')).toContainText('背包面板');
    await expect(page.getByRole('banner')).toContainText('InventoryPanel.prefab');

    await page.locator('[data-file-id="GameProject/prefabs"]').click();
    await page.keyboard.press('Enter');
    await page.locator('[data-file-id="GameProject/prefabs"]').click();
    await page.getByRole('button', { name: 'prefabs 更多操作' }).click();
    await page.getByRole('menuitem', { name: '新建文件夹' }).click();
    await expect(page.getByTestId('file-preview')).toContainText('在 prefabs 下输入文件夹名称。');
    await page.getByTestId('new-folder-name').fill('TempFolder');
    await page.getByTestId('create-folder').click();
    await expect(page.getByTestId('resource-explorer')).toContainText('TempFolder');

    await page.locator('[data-file-id="GameProject/prefabs/TempFolder"]').click();
    await page.keyboard.press('F2');
    await page.getByTestId('inline-rename-entry').fill('RenamedFolder');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('resource-explorer')).toContainText('RenamedFolder');
    await page.locator('[data-file-id="GameProject/prefabs/RenamedFolder"]').click();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.keyboard.press('Delete');
    await expect(page.locator('[data-file-id="GameProject/prefabs/RenamedFolder"]')).toHaveCount(0);

    await page.locator('[data-file-id="GameProject/prefabs"]').click();
    await page.getByTestId('new-prefab-name').fill('MenuPanel');
    await page.getByTestId('create-prefab').click();
    await expect(page.getByTestId('resource-explorer')).toContainText('MenuPanel.prefab');
    await expect(page.getByTestId('hierarchy-tree')).toContainText('MenuPanel');
    await expect(page.getByRole('banner')).toContainText('MenuPanel.prefab');

    const hierarchyTree = page.getByTestId('hierarchy-tree');
    const rootNode = hierarchyTree.locator('.nodeRow').filter({ hasText: 'MenuPanel' }).first();
    const selectRootNode = async () => {
        await rootNode.click();
    };

    await page.getByTestId('basic-component-library').getByRole('button', { name: '基础组件库' }).click();
    await page.locator('[data-basic-component="button"]').dragTo(rootNode);
    await expect(hierarchyTree).toContainText('按钮1');
    await selectRootNode();
    await page.locator('[data-basic-component="text"]').dragTo(rootNode);
    await expect(hierarchyTree).toContainText('文字1');
    await selectRootNode();
    await page.locator('[data-basic-component="image"]').dragTo(rootNode);
    await expect(hierarchyTree).toContainText('图片1');
    await selectRootNode();
    await page.getByTestId('project-file-section').getByRole('button', { name: /项目文件/ }).click();
    await page.locator('[data-file-id="GameProject/prefabs/HudPanel.prefab"]').dragTo(
        rootNode,
    );
    await expect(hierarchyTree).toContainText('HudPanel 实例');
    await selectRootNode();

    await page.getByRole('textbox', { name: '名称', exact: true }).fill('SavedMenu');
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByTestId('save-status')).toContainText('已保存 MenuPanel.prefab');
    const savedPrefab = await page.evaluate(async () => {
        const project = await window.showDirectoryPicker!();
        const prefabs = await project.getDirectoryHandle('prefabs');
        const file = await prefabs.getFileHandle('MenuPanel.prefab');
        return JSON.parse(await (await file.getFile()).text());
    });
    expect(savedPrefab.root.name).toBe('SavedMenu');
    expect(savedPrefab.root.children.map((node: { key: string }) => node.key)).toEqual(['button1', 'text1', 'image1', 'hudPanelInstance1_hudRoot']);
    expect(savedPrefab.root.children[0].components.map((component: { type: string }) => component.type)).toContain('ui.Button');
    expect(savedPrefab.root.children[1].components[0].type).toBe('ui.TextGraphic');
    expect(savedPrefab.root.children[2].components[0].type).toBe('ui.ImageGraphic');
    expect(savedPrefab.root.children[3].name).toBe('HudPanel 实例');
    expect(savedPrefab.root.children[3].children[0].key).toBe('hudPanelInstance1_scoreLabel');
});

test('remote service config stays simple and does not expose tokens', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('ai-config-toggle').click();
    await page.getByRole('button', { name: 'AI 服务' }).click();
    await page.getByTestId('ai-remote-endpoint').fill('/proposal');
    await expect(page.getByTestId('ai-remote-model-token')).toHaveCount(0);
    await page.getByText('高级').click();
    await page.getByTestId('ai-remote-timeout').fill('5000');

    const storedRemoteConfig = await page.evaluate((key) => localStorage.getItem(key), remoteConfigStorageKey);
    expect(storedRemoteConfig).toContain('/proposal');
    expect(storedRemoteConfig).toContain('Authorization');
    expect(storedRemoteConfig).not.toContain('token');
});
