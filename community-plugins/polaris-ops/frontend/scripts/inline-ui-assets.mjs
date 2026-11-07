#!/usr/bin/env node
/**
 * Gzip + blob-module inline for opaque-origin community plugin iframes.
 * Adapted from community-plugins/kubernetes/scripts/inline-ui-assets.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist')

function assetPath(url) {
  const path = /^https?:/.test(url) ? new URL(url).pathname : url
  const absolute = resolve(root, decodeURIComponent(path.replace(/^\//, '').split(/[?#]/)[0]))
  if (relative(root, absolute).startsWith('..')) throw new Error(`Asset outside build directory: ${url}`)
  return absolute
}

let html = await readFile(resolve(root, 'index.html'), 'utf8')
for (const match of [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)]) {
  const js = await readFile(assetPath(match[1]), 'utf8')
  const compressed = gzipSync(js, { level: 9 }).toString('base64')
  html = html.replace(match[0], '').replace(
    '</body>',
    `<script>
(async () => {
const ensureHostBridge = () => {
  const dw = window.datawisePlugin;
  if (!dw) return undefined;
  return new Proxy(dw, {
    get(target, prop, receiver) {
      if (prop === 'theme') {
        const appearance = target.theme && target.theme.appearance
          || (typeof target.appearance === 'string' ? target.appearance : undefined);
        return appearance ? { appearance } : target.theme;
      }
      if (prop === 'onContext') return target.onContextChange || target.onContext;
      if (prop === 'request') return target.request != null ? target.request : target.invoke;
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      return Reflect.set(target, prop, value, receiver);
    },
  });
};
const waitForHost = async (ms = 15000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const host = ensureHostBridge();
    if (host && host.ready) return host;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('Host bridge unavailable');
};
try {
  document.getElementById('root').textContent = 'Loading…';
  const host = await waitForHost();
  await Promise.race([
    host.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Host ready timed out')), 8000)),
  ]).catch(() => {});
  const compressed = Uint8Array.from(atob("${compressed}"), character => character.charCodeAt(0));
  const source = await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  const moduleURL = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
  try { await import(moduleURL); } finally { URL.revokeObjectURL(moduleURL); }
} catch (error) {
  document.getElementById('root').textContent = 'Error: ' + String(error?.message || error);
  console.error(error);
}
})();
</script></body>`,
  )
}

for (const match of [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]) {
  const css = await readFile(assetPath(match[1]), 'utf8')
  for (const url of css.matchAll(/url\(\s*['"]?([^'"\s)]+)/g)) {
    if (!/^(data:|blob:|#)/.test(url[1])) throw new Error(`External CSS asset: ${url[1]}`)
  }
  html = html.replace(match[0], `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`)
}

if (/<script\b[^>]*\bsrc=|<link\b[^>]*rel="(?:stylesheet|modulepreload)"/i.test(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''))) {
  throw new Error('DataWise build still contains external executable assets')
}
const bytes = Buffer.byteLength(html)
if (bytes > 8 * 1024 * 1024) throw new Error(`DataWise HTML exceeds 8 MiB asset limit (${bytes} bytes)`)
await writeFile(resolve(root, 'index.html'), html)
console.log(`OK inlined UI (${(bytes / 1024 / 1024).toFixed(2)} MiB): ${resolve(root, 'index.html')}`)
