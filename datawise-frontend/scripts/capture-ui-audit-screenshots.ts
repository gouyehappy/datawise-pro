/**
 * Dual-skin UI audit matrix (classic + ide).
 *
 *   npm run capture:ui-audit --prefix datawise-frontend
 *
 * Output: docs/assets/ui-audit/{classic,ide}/*.png + MANIFEST.md
 */
import {spawn, type ChildProcess} from 'node:child_process'
import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium, type BrowserContext, type Page} from '@playwright/test'
import ports from '../runtime-ports.json' with {type: 'json'}
import {installAnalysisE2eMocks, installWorkspaceE2eMocks} from '../e2e/helpers/mock-api'
import type {ThemePreferences} from '../src/features/settings/constants/theme-presets'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = join(__dirname, '..')
const REPO_ROOT = join(FRONTEND_ROOT, '..')
const OUT_ROOT = join(REPO_ROOT, 'docs', 'assets', 'ui-audit')
const ORIGIN = `http://127.0.0.1:${ports.frontendE2e}`
const VIEWPORT = {width: 1280, height: 800}
const SKINS = ['classic', 'ide'] as const
type UiSkin = (typeof SKINS)[number]

type CaptureJob = {
    name: string
    title: string
    caption: string
    run: (page: Page, out: string, skin: UiSkin) => Promise<void>
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer(url: string, timeoutMs: number) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(url)
            if (res.ok) return
        } catch {
            // retry
        }
        await sleep(400)
    }
    throw new Error(`Timed out waiting for ${url}`)
}

function startVite(): Promise<{proc: ChildProcess; stop: () => void}> {
    return new Promise((resolve, reject) => {
        const proc = spawn(
            process.platform === 'win32' ? 'npx.cmd' : 'npx',
            ['vite', '--port', String(ports.frontendE2e), '--strictPort', '--host', '127.0.0.1'],
            {cwd: FRONTEND_ROOT, stdio: 'pipe', shell: process.platform === 'win32'},
        )
        let settled = false
        const stop = () => {
            if (!proc.killed) proc.kill('SIGTERM')
        }
        proc.stderr?.on('data', (chunk: Buffer) => {
            const text = chunk.toString()
            if (text.includes('Error') && !settled) {
                settled = true
                reject(new Error(text))
            }
        })
        waitForServer(ORIGIN, 120_000)
            .then(() => {
                if (!settled) {
                    settled = true
                    resolve({proc, stop})
                }
            })
            .catch((error) => {
                stop()
                reject(error)
            })
    })
}

function themePrefs(uiSkin: UiSkin): ThemePreferences {
    return {
        appearance: 'light',
        background: 'cool',
        primary: 'blue',
        uiSkin,
    }
}

async function saveShellScreenshot(page: Page, outPath: string) {
    const shell = page.locator('.shell')
    await shell.waitFor({state: 'visible', timeout: 20_000})
    await shell.screenshot({path: outPath, type: 'png', animations: 'disabled'})
}

async function openShell(page: Page, uiSkin?: UiSkin) {
    await page.goto(`${ORIGIN}/`)
    await page.locator('.shell').waitFor({state: 'visible', timeout: 20_000})
    const onboarding = page.getByRole('dialog', {name: '新手指引'})
    if (await onboarding.isVisible().catch(() => false)) {
        await page.getByRole('button', {name: '跳过'}).click()
    }
    if (uiSkin) {
        // guest bootstrap 忽略 theme prefs（guestWrite=false）；截图前强制 skin 钩子
        await page.evaluate((s) => document.documentElement.setAttribute('data-ui-skin', s), uiSkin)
    }
    await sleep(400)
}

const NAV_ALIASES: Record<'仪表盘' | '数据库' | 'AI 聊天' | '插件', RegExp> = {
    仪表盘: /^(仪表盘|Dashboard)$/,
    数据库: /^(数据库|Database)$/,
    'AI 聊天': /^(AI 聊天|AI)$/,
    插件: /^(插件|Plugins)$/,
}

async function navTo(page: Page, module: keyof typeof NAV_ALIASES) {
    const mainNav = page.locator('nav.tool-stripe__group').first()
    const btn = mainNav.getByRole('button', {name: NAV_ALIASES[module]})
    await btn.waitFor({state: 'visible', timeout: 20_000})
    if (module === '数据库') {
        const explorerVisible = await page.locator('.explorer').isVisible().catch(() => false)
        if (explorerVisible) {
            await sleep(200)
            return
        }
    }
    await btn.click()
    await sleep(400)
    if (module === '数据库') {
        await page.locator('.explorer').waitFor({state: 'visible', timeout: 15_000})
    }
}

async function openSettings(page: Page) {
    await page.keyboard.press('Control+,')
    await page.getByRole('heading', {name: '设置', exact: true}).waitFor({state: 'visible', timeout: 15_000})
    await sleep(300)
}

async function selectSettingsNav(page: Page, label: string) {
    await page.locator('.module-shell__nav-item', {hasText: label}).click()
    await sleep(400)
}

async function openTeam(page: Page) {
    const brand = page.locator('.nav-brand .tool-btn--brand')
    if (await brand.isVisible({timeout: 2000}).catch(() => false)) {
        await brand.click()
        await sleep(300)
        const teamEntry = page.getByText(/团队协作|Team collaboration/).first()
        if (await teamEntry.isVisible().catch(() => false)) {
            await teamEntry.click()
            await sleep(500)
            return
        }
        await page.keyboard.press('Escape').catch(() => undefined)
    }
    await page.keyboard.press('Control+K')
    await sleep(300)
    const input = page.locator('.palette input, [role="dialog"] input').first()
    if (await input.isVisible().catch(() => false)) {
        await input.fill('团队协作')
        await sleep(300)
        await page.keyboard.press('Enter')
        await sleep(500)
    }
}

async function captureDashboard(page: Page, outPath: string, skin: UiSkin) {
    await installWorkspaceE2eMocks(page)
    await openShell(page, skin)
    await navTo(page, '仪表盘')
    await sleep(600)
    await saveShellScreenshot(page, outPath)
}

async function captureSqlConsole(page: Page, outPath: string, skin: UiSkin) {
    await installWorkspaceE2eMocks(page)
    await openShell(page, skin)
    await navTo(page, '数据库')
    await page.keyboard.press('Control+Shift+KeyL')
    const editor = page.getByRole('textbox', {name: 'Editor content'})
    await editor.waitFor({state: 'visible', timeout: 15_000})
    await editor.focus()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('SELECT 1 AS id')
    await page.locator('.console-run-btn').click()
    await page.locator('.data-grid .th-label', {hasText: 'id'}).waitFor({timeout: 15_000})
    await sleep(400)
    await saveShellScreenshot(page, outPath)
}

async function captureWelcome(page: Page, outPath: string, skin: UiSkin) {
    await installWorkspaceE2eMocks(page)
    await openShell(page, skin)
    await navTo(page, '数据库')
    await sleep(500)
    await saveShellScreenshot(page, outPath)
}

async function captureAi(page: Page, outPath: string, skin: UiSkin) {
    await installAnalysisE2eMocks(page)
    await openShell(page, skin)
    await navTo(page, 'AI 聊天')
    await sleep(600)
    await saveShellScreenshot(page, outPath)
}

async function capturePlugins(page: Page, outPath: string, skin: UiSkin) {
    await installWorkspaceE2eMocks(page)
    await openShell(page, skin)
    await navTo(page, '插件')
    await page.getByText('插件中心').first().waitFor({state: 'visible', timeout: 15_000})
    await sleep(500)
    await saveShellScreenshot(page, outPath)
}

async function capturePackStore(page: Page, outPath: string, skin: UiSkin) {
    await installWorkspaceE2eMocks(page)
    await openShell(page, skin)
    const packBtn = page.locator('nav.tool-stripe__group').first().getByRole('button', {
        name: /扩展商店|Extension store/,
    })
    if (await packBtn.isVisible().catch(() => false)) {
        await packBtn.click()
        await sleep(900)
    } else {
        await page.keyboard.press('Control+K')
        await sleep(300)
        const input = page.locator('.palette input, [role="dialog"] input').first()
        await input.waitFor({state: 'visible', timeout: 10_000}).catch(() => undefined)
        if (await input.isVisible().catch(() => false)) {
            await input.fill('扩展商店')
            await sleep(300)
            await page.keyboard.press('Enter')
            await sleep(700)
        }
    }
    await saveShellScreenshot(page, outPath)
}

async function captureSettingsBasic(page: Page, outPath: string, skin: UiSkin) {
    await installWorkspaceE2eMocks(page)
    await openShell(page, skin)
    await openSettings(page)
    await selectSettingsNav(page, '基础设置')
    await sleep(400)
    await saveShellScreenshot(page, outPath)
}

async function captureSettingsUsers(page: Page, outPath: string, skin: UiSkin) {
    await installWorkspaceE2eMocks(page)
    await openShell(page, skin)
    await openSettings(page)
    // Dense admin-ish panel available without admin-only nav (userPermissions is gated)
    await selectSettingsNav(page, '连接健康')
    await sleep(500)
    await saveShellScreenshot(page, outPath)
}

async function captureTeam(page: Page, outPath: string, skin: UiSkin) {
    await installWorkspaceE2eMocks(page)
    await openShell(page, skin)
    await openTeam(page)
    await sleep(500)
    await saveShellScreenshot(page, outPath)
}

async function captureConnectionForm(page: Page, outPath: string, skin: UiSkin) {
    await installWorkspaceE2eMocks(page)
    await openShell(page, skin)
    await navTo(page, '数据库')
    await page.locator('.explorer').waitFor({state: 'visible', timeout: 20_000})
    const addBtn = page.getByRole('button', {name: /新建数据源|新建连接/}).first()
    if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.click()
    } else {
        await page.locator('.explorer').getByRole('button').first().click()
    }
    await sleep(400)
    const mysql = page.getByText('MySQL', {exact: true}).first()
    if (await mysql.isVisible().catch(() => false)) {
        await mysql.click()
        await sleep(600)
    }
    await saveShellScreenshot(page, outPath)
}

const JOBS: CaptureJob[] = [
    {name: '01-dashboard', title: '仪表盘', caption: '模块页顶栏 / 统计卡 / journey', run: captureDashboard},
    {name: '02-workspace-welcome', title: '数据库工作台', caption: '资源树 + 欢迎/工作区', run: captureWelcome},
    {name: '03-sql-console', title: 'SQL 控制台', caption: 'workbench-page 编辑器与结果网格', run: captureSqlConsole},
    {name: '04-ai', title: 'AI 工作台', caption: 'AI 聊天壳层', run: captureAi},
    {name: '05-plugins', title: '插件中心', caption: '模块页卡片列表', run: capturePlugins},
    {name: '06-pack-store', title: '扩展商店', caption: 'Pack 营销/模块页', run: capturePackStore},
    {name: '07-settings-basic', title: '设置 · 基础', caption: 'SettingsPageShell + 皮肤选择', run: captureSettingsBasic},
    {name: '08-settings-health', title: '设置 · 连接健康', caption: '密集设置面板', run: captureSettingsUsers},
    {name: '09-team', title: '团队', caption: '团队模块页', run: captureTeam},
    {name: '10-connection-form', title: '新建连接', caption: '表单 / 模态流程', run: captureConnectionForm},
]

function writeManifest() {
    const lines = [
        '# UI Audit Screenshot Matrix',
        '',
        '> Generated by `npm run capture:ui-audit --prefix datawise-frontend` (Mock API).  ',
        '',
        'Each surface is captured under **classic** and **ide** skins.',
        '',
        '| File | Title | Unification notes |',
        '|------|-------|-------------------|',
        '| `classic/01-dashboard.png` / `ide/01-dashboard.png` | 仪表盘 | `ModulePageHeader` hero + `ModulePageRegions`；`DwCard` widget |',
        '| `classic/02-workspace-welcome.png` / `ide/02-workspace-welcome.png` | 数据库工作台 | Welcome：`wb-extension` + `DwButton` CTA |',
        '| `classic/03-sql-console.png` / `ide/03-sql-console.png` | SQL 控制台 | `wb-editor-results` |',
        '| `classic/04-ai.png` / `ide/04-ai.png` | AI 工作台 | `ModuleHeader`（仅 AI） |',
        '| `classic/05-plugins.png` / `ide/05-plugins.png` | 插件中心 | `DwCard` feature |',
        '| `classic/06-pack-store.png` / `ide/06-pack-store.png` | 扩展商店 | Pack 营销卡（非 DwCard） |',
        '| `classic/07-settings-basic.png` / `ide/07-settings-basic.png` | 设置 · 基础 | SettingsPageShell + 皮肤选择 |',
        '| `classic/08-settings-health.png` / `ide/08-settings-health.png` | 设置 · 连接健康 | 密集设置面板 |',
        '| `classic/09-team.png` / `ide/09-team.png` | 团队 | `DwCard` panel / onboarding |',
        '| `classic/10-connection-form.png` / `ide/10-connection-form.png` | 新建连接 | `wb-extension` |',
        '',
        '## §7.5 卡片抽检',
        '',
        '计算样式探针：`npx tsx scripts/spotcheck-card-skins.ts`（在 `datawise-frontend` 下）。',
        '',
        'Capture 在 `openShell` 后强制 `data-ui-skin`（guest bootstrap 不会应用 theme prefs）。',
        '',
        '## 护栏',
        '',
        '```bash',
        'npm run typecheck --prefix datawise-frontend',
        'npm run audit:ui-style --prefix datawise-frontend',
        'npm run capture:ui-audit --prefix datawise-frontend',
        '```',
        '',
    ]
    writeFileSync(join(OUT_ROOT, 'MANIFEST.md'), lines.join('\n'), 'utf8')
}

async function runSkin(context: BrowserContext, skin: UiSkin) {
    const outDir = join(OUT_ROOT, skin)
    mkdirSync(outDir, {recursive: true})
    for (const job of JOBS) {
        const page = await context.newPage()
        await page.addInitScript(
            ({prefs, completedKey}) => {
                localStorage.setItem('dw-cli-onboarding-completed', '1')
                localStorage.setItem(completedKey, '1')
                const raw = JSON.stringify(prefs)
                // ThemePreferences 为 user scope：bootstrap 读 guest/无后缀，登录后读 user:1
                localStorage.setItem('dw-cli-theme-prefs', raw)
                localStorage.setItem('dw-cli-theme-prefs:guest', raw)
                localStorage.setItem('dw-cli-theme-prefs:user:1', raw)
            },
            {prefs: themePrefs(skin), completedKey: 'dw-cli-onboarding-completed'},
        )
        const outPath = join(outDir, `${job.name}.png`)
        console.log(`[ui-audit] ${skin}/${job.name}`)
        try {
            await job.run(page, outPath, skin)
        } catch (error) {
            console.warn(`[ui-audit] skip ${skin}/${job.name}:`, error)
        }
        await page.close()
    }
}

async function main() {
    mkdirSync(OUT_ROOT, {recursive: true})
    const {stop} = await startVite()
    const browser = await chromium.launch({headless: true})
    try {
        for (const skin of SKINS) {
            const context = await browser.newContext({
                viewport: VIEWPORT,
                deviceScaleFactor: 2,
                locale: 'zh-CN',
            })
            await runSkin(context, skin)
            await context.close()
        }
        writeManifest()
    } finally {
        await browser.close()
        stop()
    }
    console.log(`[ui-audit] done (${SKINS.length * JOBS.length} shots)`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
