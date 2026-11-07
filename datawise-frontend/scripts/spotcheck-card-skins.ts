/**
 * §7.5 card-surface dual-skin probe (classic × ide).
 *   npx tsx scripts/spotcheck-card-skins.ts
 */
import {spawn, type ChildProcess} from 'node:child_process'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium, type Page} from '@playwright/test'
import ports from '../runtime-ports.json' with {type: 'json'}
import {installWorkspaceE2eMocks} from '../e2e/helpers/mock-api'

const FRONTEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGIN = `http://127.0.0.1:${ports.frontendE2e}`

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForServer(url: string, timeoutMs: number) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* retry */
    }
    await sleep(400)
  }
  throw new Error(`timeout ${url}`)
}

async function startVite(): Promise<{stop: () => void}> {
  const proc: ChildProcess = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['vite', '--port', String(ports.frontendE2e), '--strictPort', '--host', '127.0.0.1'],
      {cwd: FRONTEND_ROOT, stdio: 'pipe', shell: process.platform === 'win32'},
  )
  const stop = () => {
    if (!proc.killed) proc.kill('SIGTERM')
  }
  try {
    await waitForServer(ORIGIN, 120_000)
  } catch (e) {
    stop()
    throw e
  }
  return {stop}
}

async function openShell(page: Page, skin: 'classic' | 'ide') {
  await page.addInitScript((s) => {
    localStorage.setItem('dw-cli-onboarding-completed', '1')
    const prefs = JSON.stringify({appearance: 'light', background: 'cool', primary: 'blue', uiSkin: s})
    // bootstrap (guest) + post-login user scope — capture 曾只写无后缀 key，导致双皮肤截图同图
    localStorage.setItem('dw-cli-theme-prefs', prefs)
    localStorage.setItem('dw-cli-theme-prefs:guest', prefs)
    localStorage.setItem('dw-cli-theme-prefs:user:1', prefs)
  }, skin)
  await page.goto(`${ORIGIN}/`)
  await page.locator('.shell').waitFor({state: 'visible', timeout: 20_000})
  const onboarding = page.getByRole('dialog', {name: '新手指引'})
  if (await onboarding.isVisible().catch(() => false)) {
    await page.getByRole('button', {name: '跳过'}).click()
  }
  await page.evaluate((s) => {
    const prefs = JSON.stringify({appearance: 'light', background: 'cool', primary: 'blue', uiSkin: s})
    localStorage.setItem('dw-cli-theme-prefs', prefs)
    localStorage.setItem('dw-cli-theme-prefs:user:1', prefs)
    document.documentElement.setAttribute('data-ui-skin', s)
  }, skin)
  await sleep(300)
}

async function nav(page: Page, label: RegExp) {
  const mainNav = page.locator('nav.tool-stripe__group').first()
  await mainNav.getByRole('button', {name: label}).click()
  await sleep(500)
}

type BoxStyle = {count: number; radius: string; shadow: 'none' | 'present'; borderTop: string} | null

async function boxStyle(page: Page, sel: string): Promise<BoxStyle> {
  const loc = page.locator(sel).first()
  if ((await loc.count()) === 0) return null
  return loc.evaluate((el, fullSel) => {
    const cs = getComputedStyle(el)
    return {
      count: document.querySelectorAll(fullSel).length,
      radius: cs.borderRadius,
      shadow: cs.boxShadow === 'none' ? ('none' as const) : ('present' as const),
      borderTop: cs.borderTopWidth,
    }
  }, sel)
}

async function probe(skin: 'classic' | 'ide', page: Page) {
  const out: Record<string, unknown> = {skin}
  await installWorkspaceE2eMocks(page)
  await openShell(page, skin)

  await nav(page, /^(仪表盘|Dashboard)$/)
  await sleep(700)
  out.dashCard = await boxStyle(page, '.dash-card')
  out.htmlSkin = await page.evaluate(() => document.documentElement.getAttribute('data-ui-skin'))

  await nav(page, /^(插件|Plugins)$/)
  await page.getByText('插件中心').first().waitFor({timeout: 15_000})
  await sleep(600)
  out.featureCard = await boxStyle(page, '.mp-feature-card')
  out.pluginCardCount = await page.locator('.mp-feature-card').count()

  // Pack store via side rail accessible name
  const packBtn = page.locator('nav.tool-stripe__group').first().getByRole('button', {
    name: /扩展商店|Extension store/,
  })
  if (await packBtn.isVisible().catch(() => false)) {
    await packBtn.click()
    await sleep(1000)
  }
  out.packCard = await boxStyle(page, '.pack-card')
  out.packCardCount = await page.locator('.pack-card').count()
  out.packHeading = await page.getByText(/扩展商店|Extension store/).count()

  // Team: brand profile (web) or palette fallback
  try {
    const brand = page.locator('.nav-brand .tool-btn--brand')
    if (await brand.isVisible({timeout: 2000}).catch(() => false)) {
      await brand.click()
      await sleep(400)
      const teamEntry = page.getByText(/团队协作|Team collaboration/).first()
      if (await teamEntry.isVisible().catch(() => false)) {
        await teamEntry.click()
        await sleep(1000)
      }
    } else {
      await page.keyboard.press('Control+K')
      await sleep(300)
      const teamInput = page.locator('.palette input, [role="dialog"] input').first()
      if (await teamInput.isVisible().catch(() => false)) {
        await teamInput.fill('团队协作')
        await sleep(400)
        await page.keyboard.press('Enter')
        await sleep(1000)
      }
    }
  } catch {
    /* team optional for this probe */
  }
  out.panelCard = await boxStyle(page, '.mp-card')
  out.mpCardCount = await page.locator('.mp-card').count()
  out.teamOnboarding = await page.locator('.team-onboarding, .team-page').count()
  out.handwrittenMpCardOutsideDw = await page.evaluate(() => {
    return [...document.querySelectorAll('.mp-card')].map((el) => el.tagName.toLowerCase())
  })

  return out
}

const {stop} = await startVite()
const browser = await chromium.launch({headless: true})
const rows: unknown[] = []
try {
  for (const skin of ['classic', 'ide'] as const) {
    const ctx = await browser.newContext({viewport: {width: 1280, height: 800}})
    const page = await ctx.newPage()
    rows.push(await probe(skin, page))
    await ctx.close()
  }
} finally {
  await browser.close()
  stop()
}

console.log(JSON.stringify(rows, null, 2))

const classic = rows[0] as Record<string, any>
const ide = rows[1] as Record<string, any>
const fails: string[] = []

function expectPresent(label: string, v: BoxStyle) {
  if (!v || v.count < 1) fails.push(`${label}: missing`)
}

expectPresent('classic.dashCard', classic.dashCard)
expectPresent('ide.dashCard', ide.dashCard)
expectPresent('classic.featureCard', classic.featureCard)
expectPresent('ide.featureCard', ide.featureCard)

if (classic.dashCard?.shadow !== 'present') fails.push('classic.dashCard should have shadow')
if (ide.dashCard?.shadow !== 'none') fails.push('ide.dashCard should have shadow:none')
if (ide.dashCard?.radius !== '0px') fails.push(`ide.dashCard radius expected 0px got ${ide.dashCard?.radius}`)
if (classic.dashCard?.radius === '0px') fails.push('classic.dashCard radius should not be 0px')

if (classic.featureCard && ide.featureCard) {
  if (ide.featureCard.radius !== '0px') fails.push(`ide.featureCard radius expected 0px got ${ide.featureCard.radius}`)
  if (classic.featureCard.radius === '0px') fails.push('classic.featureCard radius should not be 0px')
}

if (classic.packCard && ide.packCard) {
  if (ide.packCard.radius !== '0px') fails.push(`ide.packCard radius expected 0px got ${ide.packCard.radius}`)
} else {
  console.warn('[spotcheck] WARN: pack-card not reached (nav); screenshots may also miss pack')
}

if (classic.panelCard && ide.panelCard) {
  if (ide.panelCard.shadow !== 'none') fails.push('ide.panelCard should have shadow:none')
  if (ide.panelCard.radius !== '0px') fails.push(`ide.panelCard radius expected 0px got ${ide.panelCard.radius}`)
  if (classic.panelCard.radius === '0px') fails.push('classic.panelCard radius should not be 0px')
} else {
  console.warn('[spotcheck] WARN: mp-card (Team) not reached (nav)')
}

if (fails.length) {
  console.error('[spotcheck] FAIL\n' + fails.join('\n'))
  process.exit(1)
}
console.log('[spotcheck] PASS (dashboard widget + plugin feature skins OK)')
