import { defineConfig, devices } from '@playwright/test';

const localNoProxy = ['127.0.0.1', 'localhost'];
process.env.NO_PROXY = [...localNoProxy, process.env.NO_PROXY].filter(Boolean).join(',');
process.env.no_proxy = [...localNoProxy, process.env.no_proxy].filter(Boolean).join(',');

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 60_000,
    expect: {
        timeout: 10_000,
    },
    use: {
        baseURL: 'http://127.0.0.1:5196',
        trace: 'on-first-retry',
    },
    webServer: {
        command: 'VITE_PIXIFACT_PROJECT_ROOT=$PWD bunx --no-install vite apps/editor --host 127.0.0.1 --port 5196 --strictPort',
        url: 'http://127.0.0.1:5196',
        reuseExistingServer: false,
        timeout: 60_000,
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                channel: 'chrome',
            },
        },
    ],
});
