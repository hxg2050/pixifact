import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 60_000,
    expect: {
        timeout: 10_000,
    },
    use: {
        baseURL: 'http://127.0.0.1:5176',
        trace: 'on-first-retry',
    },
    webServer: {
        command: 'VITE_PIXIF_PROJECT_ROOT=$PWD pnpm exec vite apps/editor --host 127.0.0.1 --port 5176',
        url: 'http://127.0.0.1:5176',
        reuseExistingServer: !process.env.CI,
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
