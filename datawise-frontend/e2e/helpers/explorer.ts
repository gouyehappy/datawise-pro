import {expect, type Page} from '@playwright/test'
import {waitForShellReady} from './shell'

/**
 * Ensure the database explorer panel is visible.
 *
 * Default home module is already `database` with explorer open — prefer waiting
 * over clicking. The database rail *toggles* the panel when already active, so
 * a blind click often hides the explorer and flakes CI.
 */
export async function ensureExplorerVisible(page: Page) {
    await waitForShellReady(page)

    const panel = page.locator('[data-onboarding="explorer-panel"]').first()
    if (await panel.isVisible().catch(() => false)) return
    try {
        await expect(panel).toBeVisible({timeout: 25_000})
        return
    } catch {
        // Panel still closed — open via rail (one click only).
    }

    const dbBtn = page.locator('[data-onboarding="nav-database"]')
    await expect(dbBtn).toBeVisible({timeout: 20_000})
    await page.keyboard.press('Escape').catch(() => undefined)
    await dbBtn.click({force: true})
    await expect(panel).toBeVisible({timeout: 15_000})
}

/** Expand the Default connection group when the twistie is collapsed. */
export async function expandDefaultGroup(page: Page) {
    const explorer = page.locator('[data-onboarding="explorer-panel"]').first()
    await expect(explorer.getByText('Default', {exact: true})).toBeVisible({timeout: 15_000})
    const twistie = explorer.locator('.tree-node', {hasText: 'Default'}).locator('button.tree-twistie')
    if (await twistie.isVisible().catch(() => false)) {
        const expanded = await twistie.getAttribute('aria-expanded')
        if (expanded !== 'true') await twistie.click({force: true})
    }
}

/** Connection label inside the explorer tree (avoids team chips / resume banners). */
export function explorerConnectionLabel(page: Page, name: string) {
    // Prefer title= — tree labels can truncate visible text while keeping the full name in title.
    return page.locator(`[data-onboarding="explorer-panel"] .tree-label[title="${name}"]`).first()
}

export async function expectExplorerConnection(page: Page, name: string) {
    await expect(explorerConnectionLabel(page, name)).toBeVisible({timeout: 15_000})
}
