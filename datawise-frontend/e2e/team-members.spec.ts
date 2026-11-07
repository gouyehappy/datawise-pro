import {expect, test} from '@playwright/test'
import {installWorkspaceE2eMocks} from './helpers/mock-api'
import {waitForShellReady} from './helpers/shell'

test.describe('Team members smoke', () => {
    test('opens team page and shows members / invite UI', async ({page}) => {
        await installWorkspaceE2eMocks(page)
        await page.goto('/')
        await waitForShellReady(page)

        // Desktop chrome exposes team via title-bar app menu (not side-rail home).
        await page.locator('[data-onboarding="titlebar-app-menu"]').click()
        await page.getByTestId('profile-menu-team').click()

        await expect(page.getByTestId('team-page')).toBeVisible({timeout: 15_000})
        await expect(page.locator('.team-detail__title', {hasText: 'E2E Team'})).toBeVisible()

        await expect(page.getByTestId('team-members')).toBeVisible({timeout: 15_000})
        await expect(page.getByTestId('team-members-list').getByText('demo')).toBeVisible()
        await expect(page.getByTestId('team-members-list').getByText('alice')).toBeVisible()

        await page.getByTestId('team-tab-invites').click()
        await expect(page.getByTestId('team-invites')).toBeVisible({timeout: 15_000})
        await expect(page.getByTestId('team-invites-list').getByText('bob')).toBeVisible()
        await expect(page.getByTestId('team-invite-approve')).toBeVisible()

        await page.getByTestId('team-tab-sharing').click()
        await expect(page.getByTestId('team-invite-ui')).toBeVisible({timeout: 15_000})
        await expect(page.getByTestId('team-invite-code')).toHaveText('E2ECODE')
    })
})
