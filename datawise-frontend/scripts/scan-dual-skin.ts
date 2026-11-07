/**
 * Dual-skin static scanner — classic vs ide coverage / leak / gap report.
 *   npx tsx scripts/scan-dual-skin.ts
 *   npm run scan:dual-skin --prefix datawise-frontend
 *
 * No browser: reads CSS + TS sources and writes a markdown report.
 */
import {mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'

const FRONTEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STYLES = join(FRONTEND_ROOT, 'src/styles')
const SRC = join(FRONTEND_ROOT, 'src')
const OUT_MD = join(FRONTEND_ROOT, '../.vibe/runs/20260820-1552-third-ui-skin/05-dual-skin-scan.md')
const OUT_JSON = join(FRONTEND_ROOT, '../.vibe/runs/20260820-1552-third-ui-skin/05-dual-skin-scan.json')

function walk(dir: string, pred: (f: string) => boolean, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, pred, acc)
    else if (pred(p)) acc.push(p)
  }
  return acc
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Extract `html[data-ui-skin='X'] ... { props }` including nested simple blocks via brace matching. */
function extractSkinBlocks(css: string, skin: 'classic' | 'ide'): {selector: string; body: string}[] {
  const text = stripComments(css)
  const needle = skin === 'classic'
    ? /html\[data-ui-skin=['"]classic['"]\]|html:not\(\[data-ui-skin\]\)/g
    : /html\[data-ui-skin=['"]ide['"]\]/g

  const blocks: {selector: string; body: string}[] = []
  let m: RegExpExecArray | null
  while ((m = needle.exec(text))) {
    const startSel = m.index
    // walk back to include leading selectors in a comma group (approx: find previous `{` or `;` or start)
    let selStart = startSel
    for (let i = startSel - 1; i >= 0; i--) {
      const c = text[i]
      if (c === '}' || c === '{') {
        selStart = i + 1
        break
      }
      if (i === 0) selStart = 0
    }
    const brace = text.indexOf('{', startSel)
    if (brace < 0) continue
    let depth = 0
    let end = -1
    for (let i = brace; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end < 0) continue
    const selector = text.slice(selStart, brace).replace(/\s+/g, ' ').trim()
    const body = text.slice(brace + 1, end)
    // Only keep blocks whose selector mentions this skin (avoid grabbing unrelated from comma groups wrongly)
    if (skin === 'classic') {
      if (!/data-ui-skin=['"]classic['"]|:not\(\[data-ui-skin\]\)/.test(selector)) continue
    } else if (!/data-ui-skin=['"]ide['"]/.test(selector)) continue
    blocks.push({selector, body})
    needle.lastIndex = end + 1
  }
  return blocks
}

function parseProps(body: string): Map<string, string> {
  const map = new Map<string, string>()
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    map.set(m[1], m[2].trim().replace(/\s+/g, ' '))
  }
  return map
}

function extractClassTargets(selector: string): string[] {
  const classes = new Set<string>()
  const re = /\.([a-zA-Z_][\w-]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(selector))) classes.add(m[1])
  return [...classes]
}

/** Chrome / shell surfaces we expect to differ or at least be skin-aware */
const SURFACE_PROBE: {id: string; classes: string[]; note: string}[] = [
  {id: 'shell-main', classes: ['shell-main'], note: '主壳背景/边线'},
  {id: 'titlebar', classes: ['desktop-titlebar'], note: '标题栏'},
  {id: 'activity-bar', classes: ['tool-stripe', 'tool-stripe--left', 'tool-stripe--right', 'tool-btn'], note: 'Activity / Shortcut 条'},
  {id: 'tab-bar', classes: ['dw-tab-bar', 'dw-tab'], note: '工作区 Tab'},
  {id: 'status-bar', classes: ['status-bar'], note: '状态栏'},
  {id: 'tool-window', classes: ['tool-window'], note: '工具窗口壳'},
  {id: 'explorer', classes: ['explorer-panel', 'explorer-body'], note: 'Explorer'},
  {id: 'shortcut-panel', classes: ['shortcut-panel'], note: '右侧快捷面板'},
  {id: 'workbench-page', classes: ['dw-workbench-page'], note: '工作台页'},
  {id: 'module-page', classes: ['module-page', 'mp-hero', 'mp-panel', 'mp-card', 'dash-card'], note: '模块页卡片'},
  {id: 'module-shell', classes: ['module-shell__nav', 'module-shell__nav-item', 'setting-card'], note: '设置/模块壳'},
  {id: 'modal', classes: ['app-modal__panel', 'app-drawer__panel', 'dw-modal__panel'], note: 'Modal/Drawer'},
  {id: 'conn-editor', classes: ['conn-editor', 'conn-layout'], note: '连接编辑器'},
  {id: 'terminal', classes: ['terminal-pane'], note: '终端'},
  {id: 'table-detail', classes: ['table-detail__header', 'table-detail__hero', 'table-detail__ddl-card'], note: '表详情'},
  {id: 'ai-workbench', classes: ['ai-workbench', 'ai-side-explorer', 'ai-workspace'], note: 'AI 工作台'},
  {id: 'result-pane', classes: ['result-pane', 'result-pane--split', 'messages-panel', 'result-pane__main'], note: 'SQL 结果区'},
  {id: 'pack-plugin', classes: ['pack-card', 'plugin-card', 'connector-card'], note: '扩展/插件/连接器卡'},
  {id: 'lineage-er', classes: ['lineage-panel__warnings', 'dw-er-table-node', 'relation-graph'], note: '血缘/ER'},
  {id: 'schema-compare', classes: ['schema-compare__body'], note: '结构对比'},
  {id: 'menus', classes: ['dw-menu', 'dw-ctx-menu', 'dw-dropdown'], note: '菜单(靠 token)'},
]

const CHROME_TOKENS = [
  '--dw-shell-padding',
  '--dw-panel-gap',
  '--dw-panel-radius',
  '--dw-tool-stripe-width',
  '--dw-tool-btn-pad',
  '--dw-tool-icon-caption-gap',
  '--dw-titlebar-height',
  '--dw-tab-pill-radius',
  '--dw-tab-gap',
  '--dw-menu-radius',
  '--dw-menu-item-radius',
  '--dw-menu-gutter',
  '--dw-menu-active',
  '--dw-menu-item-h',
  '--dw-density-md',
  '--dw-modal-radius',
]

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

function main() {
  const classicCss = read(join(STYLES, 'skins/classic.css'))
  const ideCss = read(join(STYLES, 'skins/ide.css'))
  const variablesCss = read(join(STYLES, 'variables.css'))
  const borderSeamCss = read(join(STYLES, 'border-seam.css'))

  const classicBlocks = [
    ...extractSkinBlocks(classicCss, 'classic'),
    ...extractSkinBlocks(borderSeamCss, 'classic'),
  ]
  const ideBlocks = [
    ...extractSkinBlocks(ideCss, 'ide'),
    ...extractSkinBlocks(borderSeamCss, 'ide'),
  ]

  const classicProps = new Map<string, string>()
  const ideProps = new Map<string, string>()
  for (const b of classicBlocks) {
    for (const [k, v] of parseProps(b.body)) classicProps.set(k, v)
  }
  for (const b of ideBlocks) {
    for (const [k, v] of parseProps(b.body)) ideProps.set(k, v)
  }

  // :root defaults for chrome tokens (first declaration in variables :root-ish)
  const rootProps = parseProps(
      (() => {
        const t = stripComments(variablesCss)
        const i = t.indexOf(':root')
        if (i < 0) return ''
        const brace = t.indexOf('{', i)
        let depth = 0
        for (let j = brace; j < t.length; j++) {
          if (t[j] === '{') depth++
          else if (t[j] === '}') {
            depth--
            if (depth === 0) return t.slice(brace + 1, j)
          }
        }
        return ''
      })(),
  )

  const tokenRows: {
    token: string
    root: string
    classic: string
    ide: string
    status: 'ok-diff' | 'same-both' | 'ide-only' | 'classic-only' | 'root-only' | 'missing'
  }[] = []

  for (const token of CHROME_TOKENS) {
    const root = rootProps.get(token) ?? '—'
    const c = classicProps.get(token) ?? '—'
    const i = ideProps.get(token) ?? '—'
    let status: (typeof tokenRows)[0]['status'] = 'missing'
    if (c !== '—' && i !== '—' && c !== i) status = 'ok-diff'
    else if (c !== '—' && i !== '—' && c === i) status = 'same-both'
    else if (c === '—' && i !== '—') status = 'ide-only'
    else if (c !== '—' && i === '—') status = 'classic-only'
    else if (c === '—' && i === '—' && root !== '—') status = 'root-only'
    tokenRows.push({token, root, classic: c, ide: i, status})
  }

  const classicClasses = new Set<string>()
  const ideClasses = new Set<string>()
  for (const b of classicBlocks) extractClassTargets(b.selector).forEach((c) => classicClasses.add(c))
  for (const b of ideBlocks) extractClassTargets(b.selector).forEach((c) => ideClasses.add(c))

  const surfaceRows = SURFACE_PROBE.map((s) => {
    const inClassic = s.classes.some((c) => classicClasses.has(c))
    const inIde = s.classes.some((c) => ideClasses.has(c))
    let status: 'both' | 'ide-only' | 'classic-only' | 'neither' | 'token-only' = 'neither'
    if (s.id === 'menus') status = 'token-only'
    else if (inClassic && inIde) status = 'both'
    else if (inIde) status = 'ide-only'
    else if (inClassic) status = 'classic-only'
    return {...s, inClassic, inIde, status}
  })

  // Shared CSS that hardcodes px heights (anti-pattern) — sample
  const styleFiles = walk(STYLES, (f) => f.endsWith('.css') && !f.includes(`${join('skins')}`))
  const featureCss = walk(join(SRC, 'features'), (f) => f.endsWith('.css') || f.endsWith('.vue'))

  const jsLeaks: {file: string; line: number; text: string}[] = []
  for (const f of walk(SRC, (p) => /\.(ts|vue)$/.test(p) && !p.includes('__tests__') && !p.includes('node_modules'))) {
    const rel = relative(FRONTEND_ROOT, f).replace(/\\/g, '/')
    if (rel.includes('core/ui-skin/') || rel.includes('scripts/')) continue
    const lines = read(f).split(/\r?\n/)
    lines.forEach((line, idx) => {
      if (/uiSkin\s*===\s*['"]ide['"]/.test(line) || /\bisIde\b/.test(line) || /data-ui-skin['"]\s*===\s*['"]ide/.test(line)) {
        // allow comments
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return
        jsLeaks.push({file: rel, line: idx + 1, text: line.trim().slice(0, 120)})
      }
    })
  }

  // Feature scoped styles mentioning skin
  const featureSkinRefs: {file: string; count: number}[] = []
  for (const f of featureCss) {
    const text = read(f)
    const n = (text.match(/data-ui-skin/g) || []).length
    if (n > 0) {
      featureSkinRefs.push({file: relative(FRONTEND_ROOT, f).replace(/\\/g, '/'), count: n})
    }
  }

  // Ide-only class list top (not in classic) — chrome-ish prefixes
  const ideOnlyChrome = [...ideClasses]
      .filter((c) => !classicClasses.has(c))
      .filter((c) =>
          /^(dw-|mp-|shell|desktop|tool-|status|tab|explorer|conn-|terminal|module-|ai-|result-|table-|lineage|schema|relation|pack-|plugin|dash-|setting|editor-card|shortcut)/.test(
              c,
          ),
      )
      .sort()

  const classicOnlyChrome = [...classicClasses]
      .filter((c) => !ideClasses.has(c))
      .filter((c) =>
          /^(dw-|mp-|shell|desktop|tool-|status|tab|explorer|conn-|terminal|module-|ai-|result-|table-|app-modal|app-drawer|notification|shortcut)/.test(
              c,
          ),
      )
      .sort()

  const summary = {
    classicBlockCount: classicBlocks.length,
    ideBlockCount: ideBlocks.length,
    classicClassCount: classicClasses.size,
    ideClassCount: ideClasses.size,
    tokenOkDiff: tokenRows.filter((r) => r.status === 'ok-diff').length,
    tokenProblems: tokenRows.filter((r) => r.status !== 'ok-diff' && r.status !== 'classic-only').length,
    surfacesBoth: surfaceRows.filter((r) => r.status === 'both' || r.status === 'token-only').length,
    surfacesIdeOnly: surfaceRows.filter((r) => r.status === 'ide-only').length,
    surfacesClassicOnly: surfaceRows.filter((r) => r.status === 'classic-only').length,
    surfacesNeither: surfaceRows.filter((r) => r.status === 'neither').length,
    jsLeaks: jsLeaks.length,
    featureSkinRefs: featureSkinRefs.length,
    sharedStyleFiles: styleFiles.length,
  }

  const md: string[] = []
  md.push('# 双肤扫描报告（静态）')
  md.push('')
  md.push(`生成时间：${new Date().toISOString()}`)
  md.push('')
  md.push('> 自动扫描 `skins/classic.css` + `skins/ide.css` + `border-seam.css` + 源码硬分支。**不替代截图**，但可标出「只覆盖了一侧 / token 未拉开」的缺口。')
  md.push('')
  md.push('## 摘要')
  md.push('')
  md.push('| 项 | 值 |')
  md.push('|----|-----|')
  md.push(`| classic 选择器块 | ${summary.classicBlockCount} |`)
  md.push(`| ide 选择器块 | ${summary.ideBlockCount} |`)
  md.push(`| classic 触及 class | ${summary.classicClassCount} |`)
  md.push(`| ide 触及 class | ${summary.ideClassCount} |`)
  md.push(`| 关键 chrome token 已拉开 | ${summary.tokenOkDiff} / ${CHROME_TOKENS.length} |`)
  md.push(`| 壳层面 both/token | ${summary.surfacesBoth} |`)
  md.push(`| 壳层面 **仅 ide** | ${summary.surfacesIdeOnly} |`)
  md.push(`| 壳层面 **仅 classic** | ${summary.surfacesClassicOnly} |`)
  md.push(`| 壳层面 **两侧都无** | ${summary.surfacesNeither} |`)
  md.push(`| JS \`isIde\` / \`uiSkin==='ide'\` 泄漏 | ${summary.jsLeaks} |`)
  md.push(`| feature 内 data-ui-skin | ${summary.featureSkinRefs} |`)
  md.push('')

  md.push('## 1. 关键 chrome token 对照')
  md.push('')
  md.push('| Token | :root | classic skin | ide skin | 状态 |')
  md.push('|-------|-------|--------------|----------|------|')
  for (const r of tokenRows) {
    const mark =
        r.status === 'ok-diff'
            ? '✅ 已拉开'
            : r.status === 'same-both'
              ? '⚠️ 两侧相同'
              : r.status === 'ide-only'
                ? '⚠️ 仅 ide'
                : r.status === 'classic-only'
                  ? 'ℹ️ 仅 classic（ide 用 :root/别覆盖）'
                  : r.status === 'root-only'
                    ? '❌ 仅 :root'
                    : '❌ 缺失'
    md.push(`| \`${r.token}\` | \`${r.root}\` | \`${r.classic}\` | \`${r.ide}\` | ${mark} |`)
  }
  md.push('')

  md.push('## 2. 壳层面覆盖（是否写进 skin 选择器）')
  md.push('')
  md.push('| 面 | 说明 | classic | ide | 状态 |')
  md.push('|----|------|---------|-----|------|')
  for (const s of surfaceRows) {
    const st =
        s.status === 'both'
            ? '✅ 两侧有'
            : s.status === 'token-only'
              ? '✅ 靠 token'
              : s.status === 'ide-only'
                ? '⚠️ 仅 ide'
                : s.status === 'classic-only'
                  ? 'ℹ️ 仅 classic'
                  : '❌ 两侧无显式'
    md.push(`| ${s.id} | ${s.note} | ${s.inClassic ? 'Y' : '—'} | ${s.inIde ? 'Y' : '—'} | ${st} |`)
  }
  md.push('')

  md.push('## 3. 仅 ide 覆盖的 chrome class（classic 未点名）')
  md.push('')
  md.push(`共 **${ideOnlyChrome.length}** 个（前缀过滤）。这些在切 classic 时仍走共享默认，可能造成「差异不够明显」。`)
  md.push('')
  md.push('```')
  md.push(ideOnlyChrome.slice(0, 80).join('\n') || '(none)')
  if (ideOnlyChrome.length > 80) md.push(`… +${ideOnlyChrome.length - 80} more`)
  md.push('```')
  md.push('')

  md.push('## 4. 仅 classic 覆盖的 chrome class')
  md.push('')
  md.push('```')
  md.push(classicOnlyChrome.join('\n') || '(none)')
  md.push('```')
  md.push('')

  md.push('## 5. JS 硬分支泄漏')
  md.push('')
  if (!jsLeaks.length) {
    md.push('无（在 src 内未发现 `isIde` / `uiSkin === \'ide\'`，排除 ui-skin 与测试）。')
  } else {
    md.push('| 文件 | 行 | 片段 |')
    md.push('|------|----|------|')
    for (const l of jsLeaks) {
      md.push(`| \`${l.file}\` | ${l.line} | \`${l.text.replace(/\|/g, '\\|')}\` |`)
    }
  }
  md.push('')

  md.push('## 6. Feature 内 data-ui-skin（契约违规嫌疑）')
  md.push('')
  if (!featureSkinRefs.length) md.push('无。')
  else {
    for (const f of featureSkinRefs) md.push(`- \`${f.file}\` ×${f.count}`)
  }
  md.push('')

  md.push('## 7. 建议下一步（按报告自动排序）')
  md.push('')
  const next: string[] = []
  for (const s of surfaceRows.filter((x) => x.status === 'ide-only' || x.status === 'neither')) {
    next.push(`- [ ] 为 **${s.id}**（${s.note}）补 classic 对照，或确认「共享默认即 classic」并写进契约`)
  }
  for (const r of tokenRows.filter((x) => x.status === 'root-only' || x.status === 'same-both')) {
    next.push(`- [ ] 拉开 token \`${r.token}\`（现状：${r.status}）`)
  }
  for (const l of jsLeaks) {
    next.push(`- [ ] 收敛 JS 硬分支 \`${l.file}:${l.line}\` → capabilities`)
  }
  if (!next.length) next.push('- [x] 关键壳层扫描无高优缺口（仍建议跑 capture:ui-audit 截图回归）')
  md.push(...next)
  md.push('')

  mkdirSync(dirname(OUT_MD), {recursive: true})
  writeFileSync(OUT_MD, md.join('\n'), 'utf8')
  writeFileSync(
      OUT_JSON,
      JSON.stringify(
          {
            summary,
            tokenRows,
            surfaceRows,
            ideOnlyChrome,
            classicOnlyChrome,
            jsLeaks,
            featureSkinRefs,
          },
          null,
          2,
      ),
      'utf8',
  )

  console.log(md.join('\n'))
  console.log(`\n[scan-dual-skin] wrote ${relative(FRONTEND_ROOT, OUT_MD)}`)
  console.log(`[scan-dual-skin] wrote ${relative(FRONTEND_ROOT, OUT_JSON)}`)

  // Exit non-zero if high-priority gaps: neither surfaces or js leaks or root-only tokens
  const hard =
      summary.surfacesNeither +
      summary.jsLeaks +
      tokenRows.filter((r) => r.status === 'root-only' || r.status === 'same-both').length
  if (hard > 0) {
    console.error(`[scan-dual-skin] gaps flagged: ${hard} (see report §7)`)
    process.exitCode = 0 // informational; don't fail CI unless wired later
  }
}

main()
