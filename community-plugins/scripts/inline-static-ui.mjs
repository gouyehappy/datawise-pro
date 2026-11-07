/**
 * Inline relative <script src> / <link rel=stylesheet href> into index.html
 * for opaque-origin workbench iframes (sandbox without allow-same-origin).
 *
 * Only rewrites tags in the HTML shell — never inside <script>…</script>
 * bodies. Self-contained UIs (e.g. SSH Vite single-file) embed minified JS
 * that can contain string literals resembling <link href=…>; matching those
 * would invent bogus stylesheet paths like `+o+`.
 *
 * Usage: node community-plugins/scripts/inline-static-ui.mjs <ui-dir>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const uiDir = resolve(process.argv[2] || '.')
const indexPath = join(uiDir, 'index.html')
if (!existsSync(indexPath)) {
  console.error('Missing', indexPath)
  process.exit(1)
}

let html = readFileSync(indexPath, 'utf8')

/** Split into [shell, scriptBlock, shell, scriptBlock, …, trailingShell]. */
function splitHtmlAndScripts(source) {
  const parts = []
  const re = /<script\b[^>]*>[\s\S]*?<\/script>/gi
  let last = 0
  let match
  while ((match = re.exec(source)) !== null) {
    parts.push({ kind: 'shell', text: source.slice(last, match.index) })
    parts.push({ kind: 'script', text: match[0] })
    last = match.index + match[0].length
  }
  parts.push({ kind: 'shell', text: source.slice(last) })
  return parts
}

function inlineShell(shell) {
  let out = shell

  out = out.replace(/<link\b([^>]*)>/gi, (match, attrs) => {
    if (!/\brel\s*=\s*["']?stylesheet["']?/i.test(attrs)) {
      return match
    }
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)
    if (!href) return match
    const rel = href[1].replace(/^\.\//, '')
    if (/^(https?:|data:|blob:|\/\/)/i.test(rel)) return match
    const cssPath = join(uiDir, rel)
    if (!existsSync(cssPath)) throw new Error(`Missing stylesheet: ${rel}`)
    const css = readFileSync(cssPath, 'utf8').replace(/<\/style/gi, '<\\/style')
    return `<style>${css}</style>`
  })

  out = out.replace(/<script\b([^>]*)>\s*<\/script>/gi, (match, attrs) => {
    const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i)
    if (!src) return match
    const rel = src[1].replace(/^\.\//, '')
    if (/^(https?:|data:|blob:|\/\/)/i.test(rel)) return match
    const jsPath = join(uiDir, rel)
    if (!existsSync(jsPath)) throw new Error(`Missing script: ${rel}`)
    const js = readFileSync(jsPath, 'utf8').replace(/<\/script/gi, '<\\/script')
    const type = /\btype\s*=\s*["']module["']/i.test(attrs) ? ' type="module"' : ''
    return `<script${type}>${js}</script>`
  })

  return out
}

function isExternalScriptStub(tag) {
  // <script src="…">…</script> with no meaningful body — still needs inlining.
  // These are classified as "script" parts by splitHtmlAndScripts, so they must
  // be handled here (not only in shell text).
  return /^<script\b[^>]*\bsrc\s*=[^>]*>\s*<\/script>$/i.test(String(tag).trim())
}

html = splitHtmlAndScripts(html)
  .map((part) => {
    if (part.kind === 'shell') return inlineShell(part.text)
    if (isExternalScriptStub(part.text)) return inlineShell(part.text)
    return part.text
  })
  .join('')

const shellOnly = splitHtmlAndScripts(html)
  .filter((part) => part.kind === 'shell')
  .map((part) => part.text)
  .join('')

for (const part of splitHtmlAndScripts(html)) {
  if (part.kind === 'script') {
    const open = part.text.match(/^<script\b([^>]*)>/i)
    if (open && /\bsrc\s*=/i.test(open[1])) {
      console.error('Still has external script src after inline')
      process.exit(1)
    }
    continue
  }
  if (/<link\b[^>]*rel=["']?stylesheet/i.test(part.text)) {
    console.error('Still has external stylesheet after inline')
    process.exit(1)
  }
}
void shellOnly

writeFileSync(indexPath, html, 'utf8')
console.log(`Inlined static UI → ${indexPath} (${Buffer.byteLength(html)} bytes)`)
