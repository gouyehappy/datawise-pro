import {expect, test} from '@playwright/test'
import {installWorkspaceE2eMocks} from './helpers/mock-api'
import {ensureExplorerVisible, expandDefaultGroup, expectExplorerConnection} from './helpers/explorer'
import {waitForShellReady} from './helpers/shell'

test.describe('Core product paths', () => {
    test('shell loads with explorer connection after auth bootstrap', async ({page}) => {
        await installWorkspaceE2eMocks(page)
        await page.goto('/')
        await waitForShellReady(page)
        await ensureExplorerVisible(page)
        await expandDefaultGroup(page)
        await expectExplorerConnection(page, 'Test MySQL')
    })

    test('open SQL console from explorer path', async ({page}) => {
        await installWorkspaceE2eMocks(page)
        await page.goto('/')
        await waitForShellReady(page)
        await ensureExplorerVisible(page)

        await page.keyboard.press('Control+Shift+KeyL')
        const editor = page.getByRole('textbox', {name: 'Editor content'})
        await expect(editor).toBeVisible({timeout: 15_000})
    })
})
