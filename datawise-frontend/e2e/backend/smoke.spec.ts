import {expect, test} from '@playwright/test'

/**
 * Minimal real-backend smoke: health → guest login → shell → SQL console.
 * No API mocks; Vite proxies /api and /login to Spring Boot.
 */
test.describe('Real backend smoke', () => {
    test('health endpoint reports ok', async ({request}) => {
        const res = await request.get('/api/health')
        expect(res.ok(), `health status ${res.status()}`).toBeTruthy()
        const body = await res.json()
        expect(body.code).toBe(0)
        expect(body.data?.status).toBe('ok')
    })

    test('guest login stub returns a session', async ({request}) => {
        const res = await request.post('/login/guest', {
            form: {},
        })
        expect(res.ok(), `guest login status ${res.status()}`).toBeTruthy()
        const body = await res.json()
        expect(body.code).toBe(0)
        expect(body.data?.sessionId).toBeTruthy()
        expect(body.data?.userName).toBeTruthy()
    })

    test('shell loads and SQL console opens', async ({page}) => {
        const consoleErrors: string[] = []
        const failedResponses: string[] = []
        page.on('pageerror', (error) => {
            consoleErrors.push(String(error))
        })
        page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text())
        })
        page.on('response', (response) => {
            if (response.status() >= 500) {
                failedResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`)
            }
        })

        // Cold Vite transform on CI can exceed the default 18s boot watchdog.
        await page.addInitScript(() => {
            ;(window as Window & {__DW_BOOT_MOUNT_TIMEOUT_MS__?: number}).__DW_BOOT_MOUNT_TIMEOUT_MS__ = 90_000
        })

        await page.goto('/')
        // App force-shows shell by 45s; keep headroom for Transition + cold JVM.
        const shell = page.locator('.shell')
        try {
            await expect(shell).toBeVisible({timeout: 120_000})
        } catch (error) {
            const splashVisible = await page.locator('.app-splash').isVisible().catch(() => false)
            const openScreenVisible = await page.locator('#dw-open-screen').isVisible().catch(() => false)
            const appMounted = await page.evaluate(() => Boolean((window as Window & {__DW_APP_MOUNTED__?: boolean}).__DW_APP_MOUNTED__)).catch(() => false)
            const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 500)
            const errors = consoleErrors.slice(0, 8).join(' | ') || '(none)'
            const failed = failedResponses.slice(0, 8).join(' | ') || '(none)'
            throw new Error(
                `shell not visible within 120s (splashVisible=${splashVisible}, openScreen=${openScreenVisible}, appMounted=${appMounted}). `
                + `pageErrors=${errors}. failedResponses=${failed}. body=${bodyText}`,
                {cause: error},
            )
        }

        await page.keyboard.press('Control+Shift+KeyL')
        const editor = page.getByRole('textbox', {name: 'Editor content'})
        await expect(editor).toBeVisible({timeout: 30_000})
    })
})
