import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../ui/dist')
function assetPath(url) {
  const path = /^https?:/.test(url) ? new URL(url).pathname : url
  const absolute = resolve(root, decodeURIComponent(path.replace(/^\//, '').split(/[?#]/)[0]))
  if (relative(root, absolute).startsWith('..')) throw new Error(`Asset outside build directory: ${url}`)
  return absolute
}
const startupLabels = {}
for (const locale of ['az', 'en', 'es', 'it', 'ja', 'ko', 'pt-BR', 'tr', 'zh-CN', 'zh-TW']) {
  const resource = JSON.parse(await readFile(resolve(root, '../src/i18n/locales', locale + '.json'), 'utf8'))
  startupLabels[locale.toLowerCase()] = { loading: resource.common.loading, error: resource.common.error }
}
let html = await readFile(resolve(root, 'index.html'), 'utf8')
for (const match of [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)]) {
  const js = await readFile(assetPath(match[1]), 'utf8')
  // DataWise/.dwp caps a single asset at 8 MiB. Compress the self-contained module and
  // decode locally; blob: modules are allowed by the host's srcdoc CSP.
  const compressed = gzipSync(js, {level: 9}).toString('base64')
  html = html.replace(match[0], '').replace('</body>', `<script>
(async () => {
const labels = ${JSON.stringify(startupLabels)};
const hostLocale = () => String(window.datawisePlugin?.locale || navigator.language || 'en').replace(/_/g, '-').toLowerCase();
const messages = () => { const locale = hostLocale(); return labels[locale] || labels[locale.startsWith('zh') ? (/tw|hk|hant/.test(locale) ? 'zh-tw' : 'zh-cn') : locale.startsWith('pt') ? 'pt-br' : locale.split('-')[0]] || labels.en; };
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
  document.getElementById('root').textContent = messages().loading;
  const reportError = error => { let alert = document.getElementById('datawise-startup-error'); if (!alert) { alert = document.createElement('div'); alert.id = 'datawise-startup-error'; alert.setAttribute('role', 'alert'); document.body.appendChild(alert); } alert.textContent = messages().error + ': ' + String(error?.message || error); };
  window.addEventListener('error', event => reportError(event.error || event.message));
  window.addEventListener('unhandledrejection', event => reportError(event.reason));
  const host = await waitForHost();
  // Never block first paint forever if host env/hello is delayed.
  await Promise.race([
    host.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Host ready timed out')), 8000)),
  ]).catch(() => {});
  const connectionId = host.context?.connectionId;
  // Sidecar prefs are optional — prefer host.storage (initUiStorage) after the app mounts.
  let stored = { values: {} };
  try {
    stored = await Promise.race([
      host.invoke('ui/preferences-get', { connectionId }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('preferences-get timed out')), 3000)),
    ]);
  } catch (_) { /* empty map */ }
  const values = new Map(Object.entries((stored && stored.values) || {}));
  let persistence = Promise.resolve();
  const persist = (key, value) => { persistence = persistence.then(() => host.invoke('ui/preferences-set', {connectionId, key, value})).catch(() => {}); };
  const storage = {get length() { return values.size; }, key(index) {return [...values.keys()][index] ?? null;}, getItem(key) {return values.get(String(key)) ?? null;}, setItem(key, value) { key = String(key); value = String(value); values.set(key, value); persist(key, value); }, removeItem(key) { key = String(key); values.delete(key); persist(key, null); }, clear() { for (const key of [...values.keys()]) this.removeItem(key); }};
  try {
    Object.defineProperty(window, 'localStorage', {value: storage, configurable: true});
  } catch (_) { /* opaque shim from bootstrap already installed */ }
  const transient = new Map();
  try {
    Object.defineProperty(window, 'sessionStorage', {value: {get length(){return transient.size;}, key(index){return [...transient.keys()][index] ?? null;}, getItem(key){return transient.get(String(key)) ?? null;}, setItem(key,value){transient.set(String(key),String(value));}, removeItem(key){transient.delete(String(key));}, clear(){transient.clear();}}, configurable: true});
  } catch (_) {}

  const compressed = Uint8Array.from(atob("${compressed}"), character => character.charCodeAt(0));
  const source = await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  document.getElementById('root').textContent = messages().loading;
  const moduleURL = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
  try { await import(moduleURL); } finally { URL.revokeObjectURL(moduleURL); }
} catch (error) { document.getElementById('root').textContent = messages().error + ': ' + String(error); console.error(error); }
})();
</script></body>`)

}
for (const match of [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]) {
  const css = await readFile(assetPath(match[1]), 'utf8')
  // Vite must inline fonts and images as well as scripts and stylesheets.
  for (const url of css.matchAll(/url\(\s*['"]?([^'"\s)]+)/g)) {
    if (!/^(data:|blob:|#)/.test(url[1])) throw new Error(`External CSS asset in srcdoc build: ${url[1]}`)
  }
  html = html.replace(match[0], `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`)
}
if (/<script\b[^>]*\bsrc=|<link\b[^>]*rel="(?:stylesheet|modulepreload)"/i.test(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''))) {
  throw new Error('DataWise build still contains external executable assets')
}
if (Buffer.byteLength(html) > 8 * 1024 * 1024) throw new Error('DataWise HTML exceeds 8 MiB asset limit')
await writeFile(resolve(root, 'index.html'), html)
