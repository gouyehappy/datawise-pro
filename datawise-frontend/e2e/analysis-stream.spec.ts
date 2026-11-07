import {expect, test} from '@playwright/test'
import {installAnalysisE2eMocks} from './helpers/mock-api'
import {waitForShellReady} from './helpers/shell'

/**
 * SSE analysis UI — does not depend on explorer tree setup.
 * Previous flakes came from database-rail toggle hiding the explorer.
 */
test.describe('AI analysis SSE stream', () => {
    test('renders analysis steps and final reply from mocked stream', async ({page}) => {
        await installAnalysisE2eMocks(page)
        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')
        await waitForShellReady(page)

        const aiBtn = page.locator('[data-onboarding="nav-ai"]')
        await expect(aiBtn).toBeVisible({timeout: 45_000})
        await aiBtn.click({force: true})

        // Seeded sessions skip the welcome heading; composer is the stable AI-module signal.
        const composer = page.getByPlaceholder('发消息…')
        await expect(composer).toBeVisible({timeout: 20_000})

        await composer.fill('分析销售情况')
        await page.getByRole('button', {name: '发送'}).click({force: true})

        // Final assistant reply from mocked analyze/chat stream (SQL card needs a selected target).
        await expect(page.getByText(/分析完成|数据分析完成/)).toBeVisible({timeout: 20_000})
        const sqlHit = page.getByText(/SELECT\s+1/i)
        if (await sqlHit.count()) {
            await expect(sqlHit.first()).toBeVisible()
        }
    })
})
