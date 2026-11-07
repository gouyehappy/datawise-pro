import {expect, test} from '@playwright/test'
import {installWorkspaceE2eMocks} from './helpers/mock-api'
import {ensureExplorerVisible, expandDefaultGroup, expectExplorerConnection} from './helpers/explorer'
import {waitForShellReady} from './helpers/shell'

test.describe('Project switch', () => {
    test('switch between two projects and refresh explorer', async ({page}) => {
        await installWorkspaceE2eMocks(page)
        await page.goto('/')
        await waitForShellReady(page)

        await expect(page.locator('.ws-switcher__name')).toHaveText(/默认项目|Default/i, {timeout: 15_000})

        await ensureExplorerVisible(page)
        await expandDefaultGroup(page)
        await expectExplorerConnection(page, 'Test MySQL')

        await page.locator('.ws-switcher__trigger').click()
        await expect(page.locator('.ws-switcher__panel')).toBeVisible()
        await page.locator('.ws-switcher__row', {hasText: '支付中台'}).click()

        await expect(page.locator('.ws-switcher__name')).toHaveText('支付中台', {timeout: 15_000})
        await expandDefaultGroup(page)
        await expectExplorerConnection(page, 'Pay MySQL')
        await expect(
            page.locator('[data-onboarding="explorer-panel"] .tree-label[title="Test MySQL"]'),
        ).toHaveCount(0)
    })
})
