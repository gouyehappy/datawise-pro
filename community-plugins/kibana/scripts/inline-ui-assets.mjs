/**
 * Collapse Vite multi-chunk ui/ into a single opaque-origin-safe index.html.
 * Large JS is gzipped + loaded via blob: (allowed by host CSP).
 */
import { existsSync, rmSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../ui')
const indexPath = join(root, 'index.html')
if (!existsSync(indexPath)) {
  throw new Error(`Missing ${indexPath}`)
}

function assetPath(url) {
  const path = /^https?:/.test(url) ? new URL(url).pathname : url
  const absolute = resolve(root, decodeURIComponent(path.replace(/^\.\//, '').replace(/^\//, '').split(/[?#]/)[0]))
  if (relative(root, absolute).startsWith('..')) {
    throw new Error(`Asset outside ui/: ${url}`)
  }
  return absolute
}

let html = await readFile(indexPath, 'utf8')

for (const match of [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)]) {
  const js = await readFile(assetPath(match[1]), 'utf8')
  const compressed = gzipSync(Buffer.from(js, 'utf8'), { level: 9 }).toString('base64')
  html = html.replace(match[0], '').replace(
    '</body>',
    `<script>
(async () => {
  const rootEl = document.getElementById('root') || document.body;
  try {
    if (rootEl) rootEl.textContent = 'Loading…';
    const compressed = Uint8Array.from(atob(${JSON.stringify(compressed)}), c => c.charCodeAt(0));
    let source = await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    // Opaque-origin blob modules make \`new URL(rel, import.meta.url)\` throw Invalid URL
    // (Vite preload / EUI dynamic icons). Rewrite to a document-absolute base.
    const base = JSON.stringify(document.baseURI || location.href);
    source = source.replace(/import\\.meta\\.url/g, base);
    const moduleURL = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try { await import(moduleURL); } finally { URL.revokeObjectURL(moduleURL); }
  } catch (error) {
    if (rootEl) rootEl.textContent = 'Failed to load UI: ' + String(error && error.message || error);
    console.error(error);
  }
})();
</script></body>`,
  )
}

for (const match of [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]) {
  const css = await readFile(assetPath(match[1]), 'utf8')
  html = html.replace(match[0], `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`)
}

if (/<script\b[^>]*\bsrc=|<link\b[^>]*rel="(?:stylesheet|modulepreload)"/i.test(
  html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''),
)) {
  throw new Error('Kibana UI still has external script/stylesheet tags after inline')
}

const bytes = Buffer.byteLength(html)
if (bytes > 8 * 1024 * 1024) {
  throw new Error(`Kibana HTML exceeds 8 MiB asset limit (${bytes} bytes)`)
}

await writeFile(indexPath, html, 'utf8')

// Drop leftover Vite chunks — only index.html is served from opaque iframe.
const assetsDir = join(root, 'assets')
if (existsSync(assetsDir)) {
  rmSync(assetsDir, { recursive: true, force: true })
}

console.log(`Inlined Kibana UI → ${indexPath} (${bytes} bytes)`)
