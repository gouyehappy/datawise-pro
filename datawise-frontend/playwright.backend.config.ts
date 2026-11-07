import {defineConfig, devices} from '@playwright/test'
import ports from './runtime-ports.json' with {type: 'json'}

/**
 * Real Spring Boot + Vite Playwright config.
 * Does not replace the default mock E2E (`playwright.config.ts`).
 *
 * Usage: npm run test:e2e:backend
 */
const e2eOrigin = `http://127.0.0.1:${ports.frontendE2e}`
const backendHealth = `http://127.0.0.1:${ports.dev.backend}/api/health`

export default defineConfig({
    testDir: './e2e/backend',
    timeout: 120_000,
    fullyParallel: false,
    workers: 1,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        ...devices['Desktop Chrome'],
        baseURL: e2eOrigin,
        trace: 'on-first-retry',
    },
    webServer: [
        {
            command: 'node scripts/e2e-backend-start.mjs',
            url: backendHealth,
            reuseExistingServer: !process.env.CI,
            timeout: 300_000,
        },
        {
            command: `npx vite --port ${ports.frontendE2e} --strictPort --host 127.0.0.1`,
            url: e2eOrigin,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
        },
    ],
})
