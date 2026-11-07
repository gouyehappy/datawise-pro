/**
 * Fail packaging when workbench UI still has external script/stylesheet refs.
 * Opaque-origin iframes cannot load ./assets/*.js|css.
 *
 * Usage: node community-plugins/scripts/assert-ui-inlined.mjs <ui-dir>
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const uiDir = resolve(process.argv[2] || '.')
const indexPath = join(uiDir, 'index.html')
if (!existsSync(indexPath)) {
  console.error('Missing', indexPath)
  process.exit(1)
}

const html = readFileSync(indexPath, 'utf8')

/** Split into shell / script blocks so minified JS bodies cannot false-positive. */
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

for (const part of splitHtmlAndScripts(html)) {
  if (part.kind === 'script') {
    const open = part.text.match(/^<script\b([^>]*)>/i)
    if (open && /\bsrc\s*=/i.test(open[1])) {
      console.error(
        `${indexPath} still references external <script src>. `
          + 'Run inline-static-ui.mjs (or DATAWISE_INLINE single-file build) before packaging.',
      )
      process.exit(1)
    }
    continue
  }
  if (/<link\b[^>]*rel=["']?stylesheet/i.test(part.text)) {
    console.error(
      `${indexPath} still references external stylesheets. `
        + 'Inline CSS into <style> for opaque-origin workbench iframes.',
    )
    process.exit(1)
  }
  if (/<script\b[^>]*\bsrc\s*=/i.test(part.text)) {
    console.error(
      `${indexPath} still references external <script src>. `
        + 'Run inline-static-ui.mjs (or DATAWISE_INLINE single-file build) before packaging.',
    )
    process.exit(1)
  }
}

console.log(`OK inlined UI: ${indexPath}`)
