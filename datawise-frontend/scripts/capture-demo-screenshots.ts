/**
 * Capture README / user-manual screenshots from the Vue client (mocked API, no backend).
 *
 *   npm run capture:demos --prefix datawise-frontend
 *
 * Output: docs/assets/screenshots/*.png
 * Manifest (captions): docs/assets/screenshots/MANIFEST.md
 *
 * User manual chapters link to ../assets/screenshots/ (no duplicate copies).
 */
import {spawn, type ChildProcess} from 'node:child_process'
import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium, type Page} from '@playwright/test'
import ports from '../runtime-ports.json' with {type: 'json'}
import {installAnalysisE2eMocks, installWorkspaceE2eMocks} from '../e2e/helpers/mock-api'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = join(__dirname, '..')
const REPO_ROOT = join(FRONTEND_ROOT, '..')
const OUT_DIR = join(REPO_ROOT, 'docs', 'assets', 'screenshots')
const ORIGIN = `http://127.0.0.1:${ports.frontendE2e}`
const VIEWPORT = {width: 1280, height: 800}

type CaptureJob = {
    name: string
    title: string
    caption: string
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

    // 「数据库」在已展开资源树时再点一次会收起，截图前需避免误关
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

/** 点击资源树展开箭头（勿对 database 双击：双击会打开 SQL 编辑器） */
async function expandTreeNodeById(page: Page, nodeId: string) {
    // attribute equality handles ":" in ids (e.g. conn-1:demo)
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
    // 连接：双击会 connect + 展开库列表
    await explorer.getByText('Test MySQL', {exact: true}).dblclick()
    await expandTreeNodeById(page, 'conn-1:demo')
    await expandTreeNodeById(page, 'folder-ai-conn-1-demo')
    await explorer.getByText('分析画布', {exact: true}).waitFor({state: 'visible', timeout: 20_000})
}

async function captureDashboard(page: Page, outPath: string) {
    await installWorkspaceE2eMocks(page)
    await openShell(page)
    await navTo(page, '仪表盘')
    // Wait until dashboard content is ready — avoid capturing the boot splash / lazy chunk spinner.
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

async function capturePlugins(page: Page, outPath: string) {
    await installWorkspaceE2eMocks(page)
    await openShell(page)
    await navTo(page, '插件')
    await page.getByText('插件中心').first().waitFor({state: 'visible', timeout: 15_000})
    await sleep(500)
    await saveShellScreenshot(page, outPath)
}

async function captureSettingsBasic(page: Page, outPath: string) {
    await installWorkspaceE2eMocks(page)
    await openShell(page)
    await openSettings(page)
    await selectSettingsNav(page, '基础设置')
    await page.getByText('基础设置').first().waitFor({state: 'visible', timeout: 10_000})
    await sleep(400)
    await saveShellScreenshot(page, outPath)
}

async function captureSettingsConnectionHealth(page: Page, outPath: string) {
    await installWorkspaceE2eMocks(page)
    await openShell(page)
    await openSettings(page)
    await selectSettingsNav(page, '连接健康')
    await sleep(500)
    await saveShellScreenshot(page, outPath)
}

async function captureSettingsAi(page: Page, outPath: string) {
    await installWorkspaceE2eMocks(page)
    await openShell(page)
    await openSettings(page)
    await selectSettingsNav(page, 'AI 模型')
    await sleep(500)
    await saveShellScreenshot(page, outPath)
}

async function captureSettingsLayout(page: Page, outPath: string) {
    await installWorkspaceE2eMocks(page)
    await openShell(page)
    await openSettings(page)
    await selectSettingsNav(page, '界面布局')
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

async function capturePlatformFederated(page: Page, outPath: string) {
    await installWorkspaceE2eMocks(page)
    await openShell(page)
    await expandExplorerToAi(page)
    await page.getByText('联邦视图', {exact: true}).dblclick()
    await page.getByText('订单×用户').waitFor({state: 'visible', timeout: 15_000})
    await sleep(500)
    await saveShellScreenshot(page, outPath)
}

async function capturePlatformDrift(page: Page, outPath: string) {
    await installWorkspaceE2eMocks(page)
    await openShell(page)
    await expandExplorerToAi(page)
    await page.getByText('Schema 漂移', {exact: true}).dblclick()
    await page.getByText('demo → staging').waitFor({state: 'visible', timeout: 15_000})
    await sleep(500)
    await saveShellScreenshot(page, outPath)
}

async function captureConnectionForm(page: Page, outPath: string) {
    await installWorkspaceE2eMocks(page)
    await openShell(page)
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
    {
        name: '01-dashboard',
        title: '仪表盘',
        caption:
            '工作台概览：顶部可进入数据库/AI；中间为运行指标与快捷操作；左下连接状态；右侧当前工作区与已启用插件。',
        run: captureDashboard,
    },
    {
        name: '02-explorer',
        title: '资源树与命令面板',
        caption:
            '左侧连接树已展开至 AI 能力入口；中间为工作区；叠加命令面板（Ctrl+K）可搜索模块、书签与对象。',
        run: captureExplorer,
    },
    {
        name: '03-sql-console',
        title: 'SQL 控制台',
        caption:
            '上方为 Monaco 编辑器与执行按钮；下方为结果网格（已执行 SELECT 1）；可继续导出、格式化或唤起 AI。',
        run: captureSqlConsole,
    },
    {
        name: '04-ai-analysis',
        title: 'AI 分析',
        caption:
            'AI 工作台：中央对话与分析进度/结果；可配置模型与数据范围；完成后可将 SQL 打开到控制台或保存为画布。',
        run: captureAiAnalysis,
    },
    {
        name: '05-plugins',
        title: '插件中心',
        caption:
            '插件中心列出已安装能力卡片（AI、导出、格式化等）；可搜索、启停，并进入连接器/开发者相关入口。',
        run: capturePlugins,
    },
    {
        name: '06-settings-basic',
        title: '设置 · 基础设置',
        caption:
            '设置页左侧为分组导航；基础设置含语言、主题外观与皮肤等个人偏好。快捷键 Ctrl+, 打开。',
        run: captureSettingsBasic,
    },
    {
        name: '07-settings-layout',
        title: '设置 · 界面布局',
        caption:
            '控制导航栏、工具栏、右侧栏显隐，并提供工作台预览，与顶栏「配置」快捷开关一致。',
        run: captureSettingsLayout,
    },
    {
        name: '08-settings-connection-health',
        title: '设置 · 连接健康',
        caption:
            '配置连接探测间隔、异常告警与监视列表；与仪表盘「连接状态」联动，异常时写入通知抽屉。',
        run: captureSettingsConnectionHealth,
    },
    {
        name: '09-settings-ai',
        title: '设置 · AI 模型',
        caption:
            '配置 AI Provider、密钥与默认模型；是 AI 聊天、Text-to-SQL 与分析画布的前提。',
        run: captureSettingsAi,
    },
    {
        name: '10-platform-canvas',
        title: '平台 · 分析画布',
        caption:
            '从资源树「AI → 分析画布」打开目录 Tab；可查看已保存画布、参数个数，并重新运行或打开到控制台。',
        run: capturePlatformCanvas,
    },
    {
        name: '11-platform-federated',
        title: '平台 · 联邦视图',
        caption:
            '联邦视图目录：跨源虚拟视图列表；可新建向导、执行查询（注意行数边界）或 AI 生成跨源 SQL。',
        run: capturePlatformFederated,
    },
    {
        name: '12-platform-drift',
        title: '平台 · Schema 漂移',
        caption:
            '结构漂移监控列表：源/目标库、表模式、漂移数量与上次检查时间；可运行对比并打开迁移向导。',
        run: capturePlatformDrift,
    },
    {
        name: '13-connection-form',
        title: '新建连接',
        caption:
            '新建数据源流程：选择类型后填写基本信息、主机端口、认证，可选 SSH/驱动；先「测试连接」再保存。',
        run: captureConnectionForm,
    },
]

function writeManifest(jobs: CaptureJob[]) {
    const lines = [
        '# DataWise 界面截图清单',
        '',
        '> 由 `npm run capture:demos --prefix datawise-frontend` 自动生成（Mock API，无需后端）。',
        '',
        '| 文件 | 标题 | 图中信息说明 |',
        '|------|------|--------------|',
        ...jobs.map((job) => `| \`${job.name}.png\` | ${job.title} | ${job.caption} |`),
        '',
        '重新生成：',
        '',
        '```bash',
        'npm run capture:demos --prefix datawise-frontend',
        '```',
        '',
    ]
    writeFileSync(join(OUT_DIR, 'MANIFEST.md'), lines.join('\n'), 'utf8')
}

async function main() {
    mkdirSync(OUT_DIR, {recursive: true})
    const {stop} = await startVite()
    const browser = await chromium.launch({headless: true})
    const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        locale: 'zh-CN',
    })
    await context.addInitScript(() => {
        localStorage.setItem('dw-cli-onboarding-completed', '1')
    })

    try {
        for (const job of JOBS) {
            const page = await context.newPage()
            const outPath = join(OUT_DIR, `${job.name}.png`)
            console.log(`[capture] ${job.name} → ${outPath}`)
            await job.run(page, outPath)
            await page.close()
        }
        writeManifest(JOBS)
    } finally {
        await context.close()
        await browser.close()
        stop()
    }

    console.log(`[capture] done (${JOBS.length} shots)`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
