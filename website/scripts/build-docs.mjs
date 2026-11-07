/**
 * Build static HTML docs from docs/user-manual into website/dist/docs.
 * Run after `vite build` so dist/ exists. Respects VITE_BASE (e.g. /datawise-cli/).
 */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {marked} from 'marked'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(websiteRoot, '..')
const manualDir = path.join(repoRoot, 'docs', 'user-manual')
const shotsSrc = path.join(repoRoot, 'docs', 'assets', 'screenshots')
const distRoot = path.join(websiteRoot, 'dist')
const outDir = path.join(distRoot, 'docs')
const base = normalizeBase(process.env.VITE_BASE || '/')
const GH_SLUG =
  (process.env.VITE_GITHUB_REPO || process.env.DATAWISE_GITHUB_REPO || process.env.GITHUB_REPOSITORY || '')
    .trim() || 'gouyehappy/datawise-cli'
const GH_REPO = `https://github.com/${GH_SLUG}`
const GH_RELEASES = `${GH_REPO}/releases`

function normalizeBase(b) {
  if (!b || b === '/') return '/'
  return b.endsWith('/') ? b : `${b}/`
}

function siteHref(rel) {
  return `${base}${rel.replace(/^\/+/, '')}`
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function slugFromFile(name) {
  return name.replace(/\.md$/i, '')
}

function titleFromMarkdown(md, fallback) {
  const text = md.replace(/^\uFEFF/, '')
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) || ''
  const top = firstLine.match(/^#\s+(.+)$/)
  if (top) return top[1].trim()
  const any = text.match(/^#\s+(.+)$/m)
  return any ? any[1].trim() : fallback
}

/** Prefer filename-based labels so code-fence `# comments` never leak into the sidebar. */
const NAV_LABELS = {
  README: '说明书首页',
  '01-getting-started': '01 · 快速开始',
  '02-interface': '02 · 界面总览',
  '03-connections-explorer': '03 · 连接与资源树',
  '04-sql-console': '04 · SQL 控制台',
  '05-table-data': '05 · 表与数据操作',
  '06-ai-analysis': '06 · AI 分析',
  '07-dashboard': '07 · 仪表盘',
  '08-platform-hub': '08 · 平台中心',
  '09-schema-migration': '09 · Schema 对比与迁移',
  '10-team-governance': '10 · 团队与治理',
  '11-settings-plugins': '11 · 设置与插件',
  '12-desktop-ecosystem': '12 · 桌面与生态',
  '13-local-files': '13 · 本地文件工作区',
  '14-troubleshooting': '14 · 排错指南',
  '15-appendix': '15 · 附录',
}

function rewriteMarkdown(md) {
  let out = md.replace(/^\uFEFF/, '')
  // Images: ../assets/screenshots/x → assets/screenshots/x (relative to docs page)
  out = out.replace(/\]\(\.\.\/assets\/screenshots\//g, '](assets/screenshots/')
  // Chapter links ./*.md → *.html
  out = out.replace(/\]\(\.\/([^)#]+)\.md(#[^)]*)?\)/g, (_, file, hash = '') => {
    const slug = file === 'README' ? 'index' : file
    const href = slug === 'index' ? './' : `./${slug}.html`
    return `](${href}${hash})`
  })
  // Parent docs like ../DEPLOYMENT.md → GitHub
  out = out.replace(/\]\(\.\.\/([^)]+)\)/g, (_, rel) => {
    const url = `${GH_REPO}/blob/main/docs/${rel}`
    return `](${url})`
  })
  // Root README links ../../README.zh-CN.md
  out = out.replace(/\]\(\.\.\/\.\.\/([^)]+)\)/g, (_, rel) => {
    const url = `${GH_REPO}/blob/main/${rel}`
    return `](${url})`
  })
  return out
}

function stripFenceCopyNoise(html) {
  return html
}

function renderSidebar(chapters, activeSlug) {
  const items = chapters
    .map((c) => {
      const active = c.slug === activeSlug ? ' is-active' : ''
      const href = c.slug === 'README' ? './' : `./${c.slug}.html`
      return `<a class="docs-nav__link${active}" href="${escapeHtml(href)}">${escapeHtml(c.navTitle)}</a>`
    })
    .join('\n')
  return `
  <aside class="docs-sidebar" id="docs-sidebar">
    <div class="docs-sidebar__head">目录</div>
    <nav class="docs-nav" aria-label="文档目录">
      ${items}
    </nav>
  </aside>`
}

function pageShell({title, activeSlug, chapters, bodyHtml, description}) {
  const sidebar = renderSidebar(chapters, activeSlug)
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · DataWise 使用说明书</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="icon" href="${siteHref('logo.svg')}" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="./docs.css" />
</head>
<body class="docs-body">
  <header class="docs-top">
    <a class="docs-top__brand" href="${siteHref('')}">
      <img src="${siteHref('brand-logo.svg')}" alt="" width="28" height="28" />
      <span>DataWise</span>
    </a>
    <div class="docs-top__actions">
      <button type="button" class="docs-top__menu" id="docs-menu-toggle" aria-controls="docs-sidebar" aria-expanded="false">目录</button>
      <a class="docs-top__link" href="${siteHref('')}">返回官网</a>
      <a class="docs-top__link docs-top__link--primary" href="${GH_RELEASES}" target="_blank" rel="noopener noreferrer">下载</a>
    </div>
  </header>
  <div class="docs-layout">
    ${sidebar}
    <main class="docs-main">
      <article class="docs-article prose">
        ${bodyHtml}
      </article>
      <p class="docs-en-note">English UI is available in the product; this manual is maintained in Chinese. <a href="${siteHref('')}">Back to site</a>.</p>
    </main>
  </div>
  <script>
    (function () {
      var btn = document.getElementById('docs-menu-toggle');
      var side = document.getElementById('docs-sidebar');
      if (!btn || !side) return;
      btn.addEventListener('click', function () {
        var open = side.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    })();
  </script>
</body>
</html>`
}

function navTitleFor(slug, h1) {
  if (NAV_LABELS[slug]) return NAV_LABELS[slug]
  if (slug === 'README') return '说明书首页'
  const short = h1.replace(/^[\d.\s·]+/u, '').trim()
  const num = slug.match(/^(\d+)/)
  if (num) return `${num[1]} · ${short}`
  return short || slug
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, {recursive: true})
  for (const entry of fs.readdirSync(src, {withFileTypes: true})) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}

function main() {
  if (!fs.existsSync(distRoot)) {
    console.error('[build-docs] dist/ missing — run vite build first')
    process.exit(1)
  }
  if (!fs.existsSync(manualDir)) {
    console.error('[build-docs] manual dir missing:', manualDir)
    process.exit(1)
  }

  fs.rmSync(outDir, {recursive: true, force: true})
  fs.mkdirSync(outDir, {recursive: true})

  const cssSrc = path.join(websiteRoot, 'src', 'docs.css')
  fs.copyFileSync(cssSrc, path.join(outDir, 'docs.css'))

  copyDir(shotsSrc, path.join(outDir, 'assets', 'screenshots'))

  const files = fs
    .readdirSync(manualDir)
    .filter((f) => f.endsWith('.md'))
    .sort((a, b) => {
      if (a === 'README.md') return -1
      if (b === 'README.md') return 1
      return a.localeCompare(b, 'en')
    })

  const chapters = files.map((file) => {
    const slug = slugFromFile(file)
    const raw = fs.readFileSync(path.join(manualDir, file), 'utf8')
    const h1 = titleFromMarkdown(raw, slug)
    return {file, slug, h1, navTitle: navTitleFor(slug, h1), raw}
  })

  marked.setOptions({gfm: true, breaks: false})

  for (const ch of chapters) {
    const rewritten = rewriteMarkdown(ch.raw)
    const bodyHtml = stripFenceCopyNoise(marked.parse(rewritten))
    const activeSlug = ch.slug
    const html = pageShell({
      title: ch.h1,
      activeSlug,
      chapters,
      bodyHtml,
      description: 'DataWise 官方使用说明书',
    })
    const outName = ch.slug === 'README' ? 'index.html' : `${ch.slug}.html`
    fs.writeFileSync(path.join(outDir, outName), html, 'utf8')
    console.log('[build-docs]', outName)
  }

  console.log(`[build-docs] done → ${outDir} (base=${base})`)
}

main()
