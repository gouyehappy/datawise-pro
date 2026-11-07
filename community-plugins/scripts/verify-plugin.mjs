#!/usr/bin/env node
// 社区插件规范自查 — vibe coding 的机器可验证 DoD。
// 用法: node community-plugins/scripts/verify-plugin.mjs <插件目录>
// 输出逐项 ✅/⚠️/❌ 与修复建议;存在 ❌ 时退出码 1(⚠️ 不阻断)。
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_ARG = process.argv[2]
if (!ROOT_ARG) {
  console.error('用法: node verify-plugin.mjs <插件目录>  (例: community-plugins/examples/hello-workbench)')
  process.exit(2)
}
// 兼容两种传参:相对 cwd(仓库根)或相对 community-plugins/ 目录
const PLUGINS_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const ROOT = [resolve(process.cwd(), ROOT_ARG), join(PLUGINS_DIR, ROOT_ARG)]
  .find((p) => existsSync(p) && statSync(p).isDirectory())
if (!ROOT) {
  console.error(`目录不存在: ${ROOT_ARG}(在 cwd 与 ${relative(process.cwd(), PLUGINS_DIR) || '.'} 下均未找到)`)
  process.exit(2)
}

const results = []
const ok = (name) => results.push({ level: 'pass', name })
const warn = (name, hint) => results.push({ level: 'warn', name, hint })
const fail = (name, hint) => results.push({ level: 'fail', name, hint })

const ID_RE = /^[a-z0-9]+([.\-][a-z0-9]+)*$/
const VERSION_RE = /^\d+\.\d+\.\d+([.\-+][0-9A-Za-z.-]+)?$/
const BASE_PERMISSIONS = new Set(['host.workbench', 'host.filesystem', 'host.events', 'host.binary', 'host.clipboard', 'host.embed', 'host.sql', 'host.ai'])
const BINDINGS = new Set(['name', 'host', 'port', 'user', 'password', 'database', 'config', 'secret'])
const FIELD_TYPES = new Set(['text', 'number', 'password', 'textarea', 'select', 'boolean'])
const TRANSPORTS = new Set(['stdio-jsonl', 'stdio-framed'])
const CONTRIB_TYPES = new Set(['connection-provider', 'workbench', 'filesystem-provider', 'result-view', 'context-menu'])
const FS_CAPS = new Set(['read', 'write', 'delete', 'rename', 'mkdir'])
const PROVIDER_CAPS = new Set(['test', 'connect', 'disconnect'])
const MENUS = new Set(['connection', 'table', 'view'])

// ---- manifest 定位与解析 ----
const manifestPath = ['manifest.json', 'manifest.datawise.json'].map((f) => join(ROOT, f)).find(existsSync)
let manifest = null
if (!manifestPath) {
  fail('manifest 存在', '缺 manifest.json(或源形态 manifest.datawise.json)。参照 examples/hello-workbench/manifest.json')
} else {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    ok(`manifest 可解析 (${relative(ROOT, manifestPath)})`)
    if (manifestPath.endsWith('manifest.datawise.json')) {
      warn('源形态 manifest', 'package.mjs 打包时必须改写 entrypoints.backend.executable 为 bin/<os-arch>/… 并生成 manifest.json(参考 docker/package.mjs)')
    }
  } catch (e) {
    fail('manifest 可解析', `JSON 语法错误: ${e.message}`)
  }
}

const insideRoot = (p) => {
  const abs = resolve(ROOT, p)
  return abs === ROOT || abs.startsWith(ROOT + sep)
}

if (manifest) {
  // ---- 基础字段 ----
  if (manifest.manifestVersion >= 1) ok('manifestVersion')
  else fail('manifestVersion', '必须 ≥1')
  if (typeof manifest.id === 'string' && ID_RE.test(manifest.id) && manifest.id.length <= 128) ok(`id (${manifest.id})`)
  else fail('id 格式', '须匹配 ^[a-z0-9]+([.-][a-z0-9]+)*$ 且 ≤128 字符')
  if (manifest.name) ok('name')
  else fail('name', '必填,用户可见插件名')
  if (VERSION_RE.test(String(manifest.version ?? ''))) ok(`version (${manifest.version})`)
  else fail('version', '必须是 semver(如 0.1.0 / 0.7.9-beta.2)')

  // ---- 权限 ----
  const perms = Array.isArray(manifest.permissions) ? manifest.permissions : []
  const networkPerms = perms.filter((p) => p.startsWith('host.network:'))
  const bad = perms.filter((p) => !BASE_PERMISSIONS.has(p) && !p.startsWith('host.network:'))
  if (bad.length) fail('permissions 白名单', `未知权限: ${bad.join(', ')}。白名单见 Playbook §5.1`)
  else ok('permissions 白名单')
  const badNet = networkPerms.filter((p) => !/^host\.network:https:\/\/.+/.test(p))
  if (badNet.length) fail('host.network 格式', `仅 https origin: ${badNet.join(', ')}`)
  else if (networkPerms.length > 8) fail('host.network 数量', '最多 8 个 origin')
  else if (networkPerms.length) ok(`host.network (${networkPerms.length} 个)`)
  if (!perms.includes('host.workbench') && (manifest.contributions ?? []).some((c) => c.type === 'workbench')) {
    fail('permissions 一致性', '声明了 workbench 贡献但未申请 host.workbench')
  }

  // ---- engines ----
  const hostApi = manifest.engines?.hostApi
  if (/^\^?1\.\d+$/.test(String(hostApi ?? ''))) ok(`engines.hostApi (${hostApi})`)
  else fail('engines.hostApi', '形如 "^1.5"(当前宿主 1.5,^1.0–^1.4 兼容)')

  // ---- entrypoints ----
  const exec = manifest.entrypoints?.backend?.executable
  const transport = manifest.entrypoints?.backend?.transport ?? 'stdio-jsonl'
  if (!exec) fail('entrypoints.backend.executable', '必填,包内相对路径')
  else {
    if (insideRoot(exec)) ok('executable 不逃逸插件目录')
    else fail('executable 路径', '不得逃逸插件目录(禁 ../ 与绝对路径)')
    existsSync(join(ROOT, exec)) ? ok('executable 文件存在') : warn('executable 文件存在', '尚未构建(先跑 sidecar 构建,或打包脚本会生成)')
  }
  if (TRANSPORTS.has(transport)) ok(`transport (${transport})`)
  else fail('transport', '只能是 stdio-jsonl 或 stdio-framed')
  if (perms.includes('host.binary') && transport !== 'stdio-framed') {
    fail('binary⇄framed 一致性', 'host.binary 必须 stdio-framed(Java SDK 仅支持 jsonl,需二进制请选 Go/Rust)')
  } else ok('binary⇄framed 一致性')

  // ---- 贡献点 ----
  const contribs = Array.isArray(manifest.contributions) ? manifest.contributions : []
  const contribIds = new Set(contribs.map((c) => c.id).filter(Boolean))
  const unknownTypes = contribs.filter((c) => !CONTRIB_TYPES.has(c.type)).map((c) => c.type)
  if (unknownTypes.length) fail('贡献点类型', `未知 type: ${unknownTypes.join(', ')}(仅五类,见 Playbook §5.2)`)
  else ok(`贡献点类型 (${contribs.length} 个)`)

  for (const c of contribs) {
    if (c.type === 'connection-provider') {
      const badFields = (c.fields ?? []).filter((f) => !f.key || (f.binding && !BINDINGS.has(f.binding)) || (f.type && !FIELD_TYPES.has(f.type)))
      if (badFields.length) fail('字段 schema', `${c.id}: key/type/binding 非法 → ${badFields.map((f) => f.key).join(', ')}。binding 槽位: ${[...BINDINGS].join('/')}`)
      else ok(`${c.id} 字段 schema`)
      const noOptions = (c.fields ?? []).filter((f) => f.type === 'select' && !(Array.isArray(f.options) && f.options.length) && !f.options_action)
      if (noOptions.length) fail('select 选项', `${c.id}: ${noOptions.map((f) => f.key).join(', ')} 缺 options 或 options_action`)
      for (const ref of ['workbench', 'filesystemProvider']) {
        if (c[ref] && !contribIds.has(c[ref])) fail('贡献点引用', `${c.id}.${ref} → ${c[ref]} 不存在于 contributions`)
      }
      const badCaps = (c.capabilities ?? []).filter((x) => !PROVIDER_CAPS.has(x))
      if (badCaps.length) fail('capabilities', `${c.id}: ${badCaps.join(', ')}(仅 test/connect/disconnect)`)
    }
    if (c.type === 'filesystem-provider') {
      if (!c.schemes?.length || !c.rootUri) fail('FS 贡献字段', `${c.id}: schemes 与 rootUri 必填`)
      const badCaps = (c.capabilities ?? []).filter((x) => !FS_CAPS.has(x))
      if (badCaps.length) fail('FS capabilities', `${c.id}: ${badCaps.join(', ')}(仅 ${[...FS_CAPS].join('/')})`)
      if (c.capabilities?.length && !c.sessionBound && !badCaps.length) ok(`${c.id} FS(非 sessionBound → sidecar 须实现 filesystem/*)`)
    }
    if (c.type === 'context-menu' && !MENUS.has(c.menu)) fail('context-menu.menu', `${c.id}: menu 须为 ${[...MENUS].join('/')}`)
  }

  // ---- workbench ⇒ ui 入口 ----
  const hasWorkbench = contribs.some((c) => c.type === 'workbench')
  const uiEntry = manifest.entrypoints?.ui?.entry ?? (hasWorkbench ? 'ui/index.html' : null)
  if (hasWorkbench) {
    if (!manifest.entrypoints?.ui?.entry) warn('entrypoints.ui', '建议显式声明 {root:"ui", entry:"ui/index.html"}')
    const uiFile = uiEntry ? join(ROOT, uiEntry) : null
    if (uiFile && existsSync(uiFile)) {
      ok('ui 入口存在')
      // 自包含检查:禁外部 <script src> / <link href>(data: 除外)
      const html = readFileSync(uiFile, 'utf8')
      const ext = []
      for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)) {
        if (!m[1].startsWith('data:')) ext.push(`script src=${m[1]}`)
      }
      for (const m of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/g)) {
        if (!m[1].startsWith('data:')) ext.push(`link href=${m[1]}`)
      }
      if (ext.length) fail('ui/index.html 自包含', `外部引用: ${ext.slice(0, 5).join('; ')}。用 vite-plugin-singlefile,或让打包的 inline-static-ui.mjs 处理后再验`)
      else ok('ui/index.html 自包含(无外部 script/link 引用)')
    } else warn('ui 入口存在', `未找到 ${uiEntry}(前端构建后复验)`)
  }

  // ---- icon / localizations ----
  if (manifest.icon) existsSync(join(ROOT, manifest.icon)) ? ok('icon 存在') : warn('icon 存在', `${manifest.icon} 缺失`)
  const l10n = manifest.localizations ?? {}
  const l10nIds = Object.values(l10n).flatMap((l) => Object.keys(l.contributions ?? {}))
  const dangling = l10nIds.filter((id) => !contribIds.has(id))
  if (dangling.length) warn('localizations 引用', `指向不存在的贡献点: ${dangling.join(', ')}`)
  else if (l10nIds.length) ok(`localizations (${Object.keys(l10n).join(', ')})`)
}

// ---- 汇总 ----
const icon = { pass: '✅', warn: '⚠️ ', fail: '❌' }
console.log(`\n社区插件规范自查 · ${relative(process.cwd(), ROOT)}\n`)
for (const r of results) console.log(`${icon[r.level]} ${r.name}${r.hint ? `\n     └─ ${r.hint}` : ''}`)
const fails = results.filter((r) => r.level === 'fail').length
const warns = results.filter((r) => r.level === 'warn').length
console.log(`\n结果: ${fails ? `${fails} 项不合规` : '全部合规'}${warns ? `,${warns} 项提醒` : ''}`)
if (fails) {
  console.log('修复后重跑本脚本;全部 ✅ 后再执行 node package.mjs 打包。规范: community-plugins/AGENTS.md')
  process.exit(1)
}
