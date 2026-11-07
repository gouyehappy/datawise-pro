/**
 * Normalize hardcoded brand fonts in community plugin UI sources.
 * Safe to re-run.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SANS = 'var(--font-sans, "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif)'
const MONO = 'var(--font-mono, ui-monospace, Consolas, monospace)'

function patch(rel, fn) {
  const abs = path.join(root, rel)
  if (!fs.existsSync(abs)) {
    console.warn('skip', rel)
    return
  }
  const before = fs.readFileSync(abs, 'utf8')
  const after = fn(before)
  if (after !== before) {
    fs.writeFileSync(abs, after)
    console.log('patched', rel)
  } else {
    console.log('unchanged', rel)
  }
}

function stripGoogleFonts(html) {
  return html
    .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>\s*/gi, '')
    .replace(/<link[^>]*fonts\.gstatic\.com[^>]*>\s*/gi, '')
    .replace(/<link[^>]*preconnect[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>\s*/gi, '')
}

function replaceOutfit(css) {
  return css
    .replace(/var\(--font-sans,\s*Outfit,\s*"Segoe UI",\s*system-ui,\s*sans-serif\)/g, SANS)
    .replace(/var\(--font-sans,\s*Outfit,\s*system-ui,\s*sans-serif\)/g, SANS)
    .replace(/font:\s*([^;]*?)\s+Outfit,\s*sans-serif/g, `font: $1 ${SANS}`)
    .replace(/font-family:\s*Outfit,\s*sans-serif/g, `font-family: ${SANS}`)
    .replace(/font:\s*500\s+(\d+(?:\.\d+)?)px\s*Outfit,\s*sans-serif/gi, `font: 500 $1px ${SANS}`)
}

for (const file of ['dbt/ui/index.html', 'health-check/ui/index.html', 'runbook/ui/index.html']) {
  patch(file, (s) => replaceOutfit(stripGoogleFonts(s)))
}

patch('duckdb/ui/index.html', (s) =>
  s.replace(
    /var\(--font-sans,\s*"Source Sans 3",\s*"Segoe UI",\s*system-ui,\s*sans-serif\)/g,
    SANS,
  ),
)

patch('data-diff/ui/index.html', (s) =>
  s
    .replace(
      /var\(--font-sans,\s*"DM Sans",\s*"Segoe UI",\s*system-ui,\s*sans-serif\)/g,
      SANS,
    )
    .replace(/"DM Mono"/g, MONO)
    .replace(/DM Mono/g, MONO),
)

patch('http-client/ui/app.css', (s) =>
  s.replace(
    /--hc-font:\s*var\(--font-sans,[^;]+\)\s*;/,
    `--hc-font: ${SANS};`,
  ),
)

console.log('done')
