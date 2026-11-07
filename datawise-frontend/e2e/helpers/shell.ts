import {expect, type Page} from '@playwright/test'

/**
 * Wait until web AppSplash / desktop boot skeleton is gone and the workbench shell is interactive.
 */
export async function waitForShellReady(page: Page) {
    // Web keeps AppSplash mounted (no .shell) until bootstrap finishes.
    await expect(page.locator('.app-splash, .shell')).toBeVisible({timeout: 45_000})
    await expect(page.locator('.shell')).toBeVisible({timeout: 60_000})
    await expect(page.locator('.app-splash')).toHaveCount(0, {timeout: 10_000})
    await expect(page.locator('.app-boot-workspace')).toHaveCount(0, {timeout: 10_000})
}
