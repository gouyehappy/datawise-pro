import {expect, test} from '@playwright/test'
import {installWorkspaceE2eMocks} from './helpers/mock-api'
import {ensureExplorerVisible, expandDefaultGroup, expectExplorerConnection} from './helpers/explorer'
import {waitForShellReady} from './helpers/shell'

test.describe('Workspace main path', () => {
    test('connect, execute SQL, and export result grid', async ({page}) => {
        await installWorkspaceE2eMocks(page)
        await page.goto('/')
        await waitForShellReady(page)

        await ensureExplorerVisible(page)
        await expandDefaultGroup(page)
        await expectExplorerConnection(page, 'Test MySQL')

        await page.keyboard.press('Control+Shift+KeyL')

        const editor = page.getByRole('textbox', {name: 'Editor content'})
        await expect(editor).toBeVisible({timeout: 15000})
        await editor.focus()
        await page.keyboard.press('Control+A')
        await page.keyboard.type('SELECT 1 AS id')

        await page.getByTestId('sql-console-run').click()

        await expect(page.getByTestId('query-result-grid').locator('.th-label', {hasText: 'id'})).toBeVisible({timeout: 15000})
        await expect(page.getByTestId('query-result-grid').locator('.data-cell').filter({hasText: /^1$/})).toBeVisible()
    })
})
