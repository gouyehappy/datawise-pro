import {defineConfig, devices} from '@playwright/test'
import ports from './runtime-ports.json' with {type: 'json'}

const e2eOrigin = `http://127.0.0.1:${ports.frontendE2e}`

export default defineConfig({
    testDir: './e2e',
    testIgnore: ['**/backend/**'],
    timeout: 90_000,
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        ...devices['Desktop Chrome'],
        baseURL: e2eOrigin,
        trace: 'on-first-retry',
    },
    webServer: {
        command: `npx vite --port ${ports.frontendE2e} --strictPort --host 127.0.0.1`,
        url: e2eOrigin,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
})
