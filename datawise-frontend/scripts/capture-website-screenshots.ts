/**
 * Capture marketing-site screenshots: dark appearance + IDE workbench skin.
 *
 *   npm run capture:website --prefix datawise-frontend
 *
 * Output: website/public/screenshots/*.png
 */
import {spawn, type ChildProcess} from 'node:child_process'
import {copyFileSync, mkdirSync, readdirSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium, type Page} from '@playwright/test'
import ports from '../runtime-ports.json' with {type: 'json'}
import {installAnalysisE2eMocks, installWorkspaceE2eMocks} from '../e2e/helpers/mock-api'
import type {ThemePreferences} from '../src/features/settings/constants/theme-presets'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = join(__dirname, '..')
const REPO_ROOT = join(FRONTEND_ROOT, '..')
const OUT_DIR = join(REPO_ROOT, 'website', 'public', 'screenshots')
const MARKETING_DIR = join(REPO_ROOT, 'docs', 'assets', 'marketing')
const ORIGIN = `http://127.0.0.1:${ports.frontendE2e}`
const VIEWPORT = {width: 1280, height: 800}

const THEME_PREFS: ThemePreferences = {
    appearance: 'dark',
    background: 'slate',
    primary: 'blue',
    uiSkin: 'ide',
    uiFont: 'noto',
    uiTextScale: 'md',
}

type CaptureJob = {
    name: string
    run: (page: Page, out: string) => Promise<void>
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

async function saveShellScreenshot(page: Page, outPath: string) {
    const shell = page.locator('.shell')
    await shell.waitFor({state: 'visible', timeout: 20_000})
    await shell.screenshot({path: outPath, type: 'png', animations: 'disabled'})
}

async function openShell(page: Page) {
    await page.goto(`${ORIGIN}/`)
    await page.locator('.shell').waitFor({state: 'visible', timeout: 20_000})
    const onboarding = page.getByRole('dialog', {name: '新手指引'})
    if (await onboarding.isVisible().catch(() => false)) {
        await page.getByRole('button', {name: '跳过'}).click()
    }
    await sleep(400)
    await ensureDarkIdeTheme(page)
}

/** After login, theme-store may have booted as guest (light). Force dark + IDE for marketing shots. */
async function ensureDarkIdeTheme(page: Page) {
    await page.evaluate((prefs) => {
        const raw = JSON.stringify(prefs)
        localStorage.setItem('dw-cli-theme-prefs', raw)
        localStorage.setItem('dw-cli-theme-prefs:guest', raw)
        localStorage.setItem('dw-cli-theme-prefs:user:1', raw)

        const app = document.querySelector('#app') as (HTMLElement & {
            __vue_app__?: {
                config: {globalProperties: { $pinia?: { _s: Map<string, { importPreferences?: (p: unknown) => void; setAppearance?: (a: string) => void; setUiSkin?: (s: string) => void }> } }}
            }
        }) | null
        const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia
        const theme = pinia?._s.get('theme')
        if (theme?.importPreferences) {
            theme.importPreferences(prefs)
            return
        }

        const root = document.documentElement
        root.setAttribute('data-theme', 'dark')
        root.setAttribute('data-ui-skin', 'ide')
        root.setAttribute('data-bg-tone', prefs.background)
        root.style.colorScheme = 'dark'
    }, THEME_PREFS)

    // Fallback: title-bar moon toggle if still light
    const isDark = await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark')
    if (!isDark) {
        const toggle = page.getByRole('button', {name: /深色|Dark|切换.*主题|theme/i}).first()
        if (await toggle.isVisible().catch(() => false)) {
            await toggle.click()
            await sleep(300)
        }
    }

    // Ensure IDE skin via settings if attribute missing
    const isIde = await page.evaluate(() => document.documentElement.getAttribute('data-ui-skin') === 'ide')
    if (!isIde) {
        await page.keyboard.press('Control+,')
        await page.getByRole('heading', {name: '设置', exact: true}).waitFor({state: 'visible', timeout: 15_000})
        await page.locator('.module-shell__nav-item', {hasText: '基础设置'}).click()
        await sleep(300)
        const ideOption = page.getByRole('button', {name: /IDE|工作台/}).first()
        if (await ideOption.isVisible().catch(() => false)) {
            await ideOption.click()
            await sleep(300)
        }
        await page.keyboard.press('Escape')
        await sleep(300)
    }

    await sleep(200)
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

/** 点击资源树展开箭头（勿对 database 双击：双击会打开 SQL 编辑器） */
async function expandTreeNodeById(page: Page, nodeId: string) {
    const exact = page.locator(`.explorer [data-tree-node-id="${nodeId}"]`)
    await exact.waitFor({state: 'visible', timeout: 20_000})
    const twistie = exact.locator('button.tree-twistie')
    if (await twistie.count()) {
        const expanded = await twistie.getAttribute('aria-expanded')
        if (expanded !== 'true') {
            await twistie.click()
            await sleep(600)
        }
        return
    }
    await exact.dblclick()
    await sleep(600)
}

async function expandExplorerToAi(page: Page) {
    await navTo(page, '数据库')
    const explorer = page.locator('.explorer')
    await explorer.waitFor({state: 'visible', timeout: 20_000})
    await explorer.getByText('Test MySQL', {exact: true}).waitFor({state: 'visible', timeout: 20_000})
    await explorer.getByText('Test MySQL', {exact: true}).dblclick()
    await expandTreeNodeById(page, 'conn-1:demo')
    await expandTreeNodeById(page, 'folder-ai-conn-1-demo')
    await explorer.getByText('分析画布', {exact: true}).waitFor({state: 'visible', timeout: 20_000})
}

async function captureDashboard(page: Page, outPath: string) {
    await installWorkspaceE2eMocks(page)
    await openShell(page)
    await navTo(page, '仪表盘')
    await page
        .getByText(/工作台概览|Workbench overview|版本亮点|Release highlights/)
        .first()
        .waitFor({state: 'visible', timeout: 30_000})
    await page.getByText(/正在加载页面|Loading page/).waitFor({state: 'hidden', timeout: 15_000}).catch(() => undefined)
    await sleep(400)
    await saveShellScreenshot(page, outPath)
}

async function captureExplorer(page: Page, outPath: string) {
    await installWorkspaceE2eMocks(page)
    await openShell(page)
    await expandExplorerToAi(page)
    await page.getByText('表', {exact: true}).waitFor({state: 'visible', timeout: 10_000}).catch(() => undefined)
    await page.keyboard.press('Control+K')
    await sleep(500)
    await saveShellScreenshot(page, outPath)
    await page.keyboard.press('Escape')
}

async function captureSqlConsole(page: Page, outPath: string) {
    await installWorkspaceE2eMocks(page)
    await openShell(page)
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

async function captureAiAnalysis(page: Page, outPath: string) {
    await installAnalysisE2eMocks(page)
    await openShell(page)
    await navTo(page, '数据库')
    await page.getByText('Test MySQL').waitFor({state: 'visible', timeout: 20_000})
    await navTo(page, 'AI 聊天')
    await sleep(400)
    const composer = page.getByPlaceholder('发消息…')
    await composer.fill('分析近三个月销售趋势')
    await page.getByRole('button', {name: '发送', exact: true}).click()
    await page.getByText('分析完成', {exact: true}).waitFor({timeout: 20_000}).catch(() => undefined)
    await page.getByText('SELECT 1').waitFor({timeout: 20_000}).catch(() => undefined)
    await sleep(500)
    await saveShellScreenshot(page, outPath)
}

async function capturePlatformCanvas(page: Page, outPath: string) {
    await installWorkspaceE2eMocks(page)
    await openShell(page)
    await expandExplorerToAi(page)
    await page.getByText('分析画布', {exact: true}).dblclick()
    await page.getByText('近三月销售趋势').waitFor({state: 'visible', timeout: 15_000})
    await sleep(500)
    await saveShellScreenshot(page, outPath)
}

const JOBS: CaptureJob[] = [
    {name: '01-dashboard', run: captureDashboard},
    {name: '02-explorer', run: captureExplorer},
    {name: '03-sql-console', run: captureSqlConsole},
    {name: '04-ai-analysis', run: captureAiAnalysis},
    {name: '10-platform-canvas', run: capturePlatformCanvas},
]

async function main() {
    mkdirSync(OUT_DIR, {recursive: true})
    const {stop} = await startVite()
    const browser = await chromium.launch({headless: true})
    const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        locale: 'zh-CN',
        colorScheme: 'dark',
    })
    await context.addInitScript(
        ({prefs}) => {
            localStorage.setItem('dw-cli-onboarding-completed', '1')
            const raw = JSON.stringify(prefs)
            // Cover guest boot + post-login user scope (see resolveUserStorageKey).
            localStorage.setItem('dw-cli-theme-prefs', raw)
            localStorage.setItem('dw-cli-theme-prefs:guest', raw)
            localStorage.setItem('dw-cli-theme-prefs:user:1', raw)
            // Paint dark chrome before Vue mounts to avoid light flash in screenshots.
            document.documentElement.dataset.theme = 'dark'
            document.documentElement.dataset.uiSkin = 'ide'
        },
        {prefs: THEME_PREFS},
    )

    try {
        for (const job of JOBS) {
            const page = await context.newPage()
            const outPath = join(OUT_DIR, `${job.name}.png`)
            console.log(`[website-capture] ${job.name} → ${outPath}`)
            await job.run(page, outPath)
            await page.close()
        }
    } finally {
        await context.close()
        await browser.close()
        stop()
    }

    mkdirSync(MARKETING_DIR, {recursive: true})
    for (const name of readdirSync(OUT_DIR)) {
        if (!name.endsWith('.png')) continue
        copyFileSync(join(OUT_DIR, name), join(MARKETING_DIR, name))
    }
    console.log(`[website-capture] done (${JOBS.length} shots, dark + ide) → website + docs/assets/marketing`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
