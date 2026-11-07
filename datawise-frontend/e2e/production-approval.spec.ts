import {expect, test} from '@playwright/test'
import {installWorkspaceE2eMocks} from './helpers/mock-api'
import {waitForShellReady} from './helpers/shell'

test.describe('Production approval smoke', () => {
    test('lists pending approval and can approve from team audit tab', async ({page}) => {
        await installWorkspaceE2eMocks(page)
        await page.goto('/')
        await waitForShellReady(page)

        // Desktop chrome exposes team via title-bar app menu (not side-rail home).
        await page.locator('[data-onboarding="titlebar-app-menu"]').click()
        await page.getByTestId('profile-menu-team').click()

        await expect(page.getByTestId('team-page')).toBeVisible({timeout: 15_000})
        await expect(page.locator('.team-detail__title', {hasText: 'E2E Team'})).toBeVisible()

        await page.getByTestId('team-tab-audit').click()
        await expect(page.getByTestId('production-approvals')).toBeVisible({timeout: 15_000})
        await expect(page.getByTestId('production-approvals').getByText('Prod MySQL')).toBeVisible()

        await page.getByTestId('production-approval-approve').click()
        await expect(page.getByText(/已批准并执行|Approved and executed/i)).toBeVisible({timeout: 10_000})
    })
})
