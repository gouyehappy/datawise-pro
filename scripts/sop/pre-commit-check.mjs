#!/usr/bin/env node
/**
 * 通用提交前检查 — 读取 scripts/project-config.json
 *
 *   node scripts/sop/pre-commit-check.mjs [--config path] [--test|--full|--all]
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

const argv = process.argv.slice(2)
const args = new Set(argv)
let configPath = process.env.SOP_CONFIG

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--config' && argv[i + 1]) {
    configPath = argv[i + 1]
    i++
  }
}

if (!configPath) {
  configPath = 'scripts/project-config.json'
}

const runTests = args.has('--test') || args.has('--full')
const fullTests = args.has('--full')
const scopeAll = args.has('--all')
const auditPlugins = args.has('--audit-plugins')

if (args.has('--help') || args.has('-h')) {
  console.log(`
通用 pre-commit check（配置驱动）

  node scripts/sop/pre-commit-check.mjs [options]

Options:
  --config <path>   项目配置（默认 scripts/project-config.json）
  --test            按改动跑测试
  --full            全量测试
  --all             工作区相对 HEAD（默认仅暂存区）
  --audit-plugins   校验 plugins.json 与 PLUGIN_REGISTRY 一致性（可选）
  --help
`)
  process.exit(0)
}

const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
}

const ok = (msg) => console.log(`${c.green}✓${c.reset} ${msg}`)
const warn = (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`)
const fail = (msg) => console.log(`${c.red}✗${c.reset} ${msg}`)
const info = (msg) => console.log(`${c.cyan}→${c.reset} ${msg}`)
const section = (title) => console.log(`\n${c.bold}${title}${c.reset}`)

let errors = 0
let warnings = 0

function bumpError() {
  errors += 1
}
function bumpWarn() {
  warnings += 1
}

function loadConfig() {
  const abs = path.isAbsolute(configPath) ? configPath : path.join(ROOT, configPath)
  if (!existsSync(abs)) {
    console.error(`配置不存在: ${abs}`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(abs, 'utf8'))
}

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

function run(cmd, cwd) {
  info(cmd)
  execSync(cmd, { cwd: path.isAbsolute(cwd) ? cwd : path.join(ROOT, cwd), stdio: 'inherit', shell: true })
}

function getChangedFiles() {
  const cmd = scopeAll
    ? 'diff --name-only --diff-filter=ACMR HEAD'
    : 'diff --cached --name-only --diff-filter=ACMR'
  const out = git(cmd)
  return out ? out.split(/\r?\n/).filter(Boolean) : []
}

function getStagedFiles() {
  const out = git('diff --cached --name-only --diff-filter=ACMR')
  return out ? out.split(/\r?\n/).filter(Boolean) : []
}

function norm(f) {
  return f.replace(/\\/g, '/')
}

function matchesAny(files, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern)
  return files.some((f) => re.test(norm(f)))
}

function isSensitive(p, cfg) {
  const n = norm(p)
  if (cfg.sensitive?.exact?.includes(n)) return true
  for (const pat of cfg.sensitive?.patterns ?? []) {
    if (new RegExp(pat).test(n)) return true
  }
  return false
}

function checkSensitive(staged, cfg) {
  section('1. 敏感文件')
  const hits = staged.filter((f) => isSensitive(f, cfg))
  if (!hits.length) {
    ok('暂存区无已知敏感路径')
    return
  }
  for (const h of hits) fail(`禁止提交: ${h}`)
  bumpError()
}

function checkApiAlignment(files, cfg) {
  section('2. API 对齐')
  const clientPat = cfg.apiAlignment?.clientPathPattern
  const serverPat = cfg.apiAlignment?.serverPathPattern
  if (!clientPat && !serverPat) {
    ok('未配置 API 对齐规则')
    return
  }
  const clientChanged = clientPat && matchesAny(files, clientPat)
  const serverChanged = serverPat && matchesAny(files, serverPat)
  if (!clientChanged && !serverChanged) {
    ok('未改动 API 客户端/服务端入口')
    return
  }
  if (clientChanged && serverChanged) {
    ok('客户端与服务端 API 入口均有改动')
    return
  }
  if (clientChanged) warn('仅改了客户端 API 路径 — 确认服务端已同步')
  if (serverChanged) warn('仅改了服务端 Controller — 确认客户端已同步')
  bumpWarn()
}

function checkConnector(files, cfg) {
  section('3. 扩展/插件')
  const pat = cfg.connector?.sourcePattern
  if (!pat || !matchesAny(files, pat)) {
    ok('未改动扩展源码')
    return
  }
  warn(cfg.connector.packageHint ?? '确认扩展产物已安装并重启服务')
  bumpWarn()
  const pluginsDir = cfg.connector.pluginsDir
  if (pluginsDir && !existsSync(path.join(ROOT, pluginsDir))) {
    warn(`${pluginsDir} 不存在`)
    bumpWarn()
  }
}

function checkBugFixArchitecture(files, staged, cfg) {
  section('4. Bug 修复方式')
  const reg = cfg.regressionTestDirPattern
  const bugLog = cfg.bugfixLogPath
  const isBugFlow =
    (reg && matchesAny(staged, reg)) ||
    (bugLog && staged.some((f) => norm(f) === norm(bugLog)))

  if (!isBugFlow) {
    ok('非 Bug regression / 台账提交')
    return
  }

  const archDir = cfg.architectureDocDir ?? 'docs/architecture'
  warn(
    `修 Bug：先读 ${archDir}/，根因层修复，禁止补丁式 workaround（堆 if / 吞错 / 单点特判）`,
  )
  bumpWarn()

  const fePat = cfg.codePatterns?.frontendBusiness
  const bePat = cfg.codePatterns?.backendBusiness
  const codeChanged =
    (fePat && matchesAny([...new Set([...staged, ...files])], fePat)) ||
    (bePat && matchesAny([...new Set([...staged, ...files])], bePat))

  if (codeChanged && !matchesAny(staged, `^${archDir.replace(/\\/g, '/')}/`)) {
    warn(`业务代码有改动 — 确认已对照 ${archDir}/；边界有变请更新架构文档`)
    bumpWarn()
  }
}

function checkBugLog(staged, cfg) {
  section('5. Bug 台账')
  const reg = cfg.regressionTestDirPattern
  const bugLog = cfg.bugfixLogPath
  if (!bugLog) {
    ok('未配置台账路径')
    return
  }
  if (!reg) {
    ok('未配置 regression 路径')
    return
  }
  const regressionChanged = matchesAny(staged, reg)
  const bugLogStaged = bugLog && staged.some((f) => norm(f) === norm(bugLog))
  if (!regressionChanged) {
    ok('未改动 regression 测例')
    return
  }
  if (bugLogStaged) {
    ok('regression 与台账均已暂存')
    return
  }
  warn(`改了 regression 但 ${bugLog} 未暂存 — 流程 A 须更新台账`)
  bumpWarn()
}

function checkArchitecture(files, cfg) {
  section('6. 架构文档')
  const archDir = (cfg.architectureDocDir ?? 'docs/architecture').replace(/\\/g, '/')
  const archChanged = matchesAny(files, `^${archDir}/`)
  const fePat = cfg.codePatterns?.frontendBusiness
  const bePat = cfg.codePatterns?.backendBusiness
  const bigCount = cfg.codePatterns?.bigChangeFileCount ?? 8
  const bigCode =
    matchesAny(files, fePat ?? /^$/) || matchesAny(files, bePat ?? /^$/)
  if (archChanged) {
    ok(`${archDir}/ 有改动`)
    return
  }
  if (bigCode && files.length >= bigCount) {
    warn(`较多业务改动但 ${archDir}/ 未更新 — 重整/新功能时建议同步`)
    bumpWarn()
  } else {
    ok('无需强制更新架构文档')
  }
}

function detectModules(files, layer) {
  const modules = new Set()
  for (const f of files) {
    const n = norm(f)
    for (const pat of layer.modulePatterns ?? []) {
      const m = n.match(new RegExp(pat))
      if (m?.[1]) modules.add(m[1])
    }
  }
  for (const mod of modules) {
    const extras = layer.moduleAliases?.[mod] ?? []
    for (const e of extras) modules.add(e)
    if (mod.startsWith('datawise-connector-') && layer.defaultModuleExtras) {
      for (const e of layer.defaultModuleExtras) modules.add(e)
    }
  }
  return [...modules]
}

function checkPluginCatalogAudit(staged, cfg) {
  section('插件 Catalog 审计')
  const audit = cfg.pluginCatalogAudit
  if (!audit) {
    info('未配置 pluginCatalogAudit — 跳过')
    return
  }
  const catalogPat = audit.catalogPathPattern ?? audit.catalogPath?.replace(/\\/g, '/')
  const registryPat = audit.registryPathPattern
  const touched =
    (catalogPat && matchesAny(staged, catalogPat)) ||
    (registryPat && matchesAny(staged, registryPat))

  if (!auditPlugins && !touched) {
    ok('未改动 catalog/registry — 跳过（加 --audit-plugins 强制校验）')
    return
  }

  const workDir = audit.workDir ?? 'datawise-frontend'
  const cmd = auditPlugins
    ? (audit.strictCommand ?? 'npm run audit:plugin-catalog:strict')
    : (audit.command ?? 'npm run audit:plugin-catalog')
  info(
    auditPlugins
      ? '强制 strict 校验 plugins.json ↔ PLUGIN_REGISTRY'
      : 'catalog/registry 有改动 — 运行 non-strict 审计',
  )
  try {
    execSync(cmd, { cwd: path.join(ROOT, workDir), stdio: 'inherit', shell: true })
    ok('plugin catalog 一致')
  } catch {
    fail('plugin catalog 审计失败 — 运行 cd datawise-frontend && npm run audit:plugin-catalog')
    bumpError()
  }
}

function runTestLayers(files, cfg, bugsOnly) {
  let sectionNum = 7
  for (const layer of cfg.testLayers ?? []) {
    if (layer.id === 'backend') continue
    if (!layer.changePattern || !matchesAny(files, layer.changePattern)) continue
    const workDir = layer.workDir ?? '.'
    const absWork = path.join(ROOT, workDir)
    if (layer.marker && !existsSync(path.join(absWork, layer.marker))) {
      warn(`跳过 ${layer.id}: ${workDir} 不存在`)
      bumpWarn()
      continue
    }
    section(`${sectionNum}. 测试 · ${layer.id}`)
    sectionNum += 1

    if (layer.typecheck) run(layer.typecheck, workDir)

    if (layer.id === 'frontend') {
      const cmd = bugsOnly && layer.testBugs ? layer.testBugs : layer.test
      if (cmd) run(cmd, workDir)
    } else if (layer.test) {
      run(layer.test, workDir)
    }

    if (layer.alsoTypecheckDir && existsSync(path.join(ROOT, layer.alsoTypecheckDir, 'package.json'))) {
      run('npm run typecheck', layer.alsoTypecheckDir)
    }
  }

  const backend = cfg.testLayers?.find((l) => l.id === 'backend')
  if (backend && matchesAny(files, backend.changePattern ?? '^$')) {
    const beDir = backend.workDir ?? 'datawise-backend'
    if (fullTests) {
      section(`${sectionNum}. 测试 · backend`)
      run(backend.test ?? 'mvn test', beDir)
    } else if (backend.testModuleTemplate) {
      const mods = detectModules(files, backend)
      section(`${sectionNum}. 测试 · backend`)
      if (mods.length) {
        run(backend.testModuleTemplate.replace('{modules}', mods.slice(0, 3).join(',')), beDir)
      } else {
        run(backend.test ?? 'mvn test', beDir)
      }
    }
  }
}

function main() {
  const cfg = loadConfig()
  console.log(`${c.bold}${cfg.projectName ?? 'Project'} pre-commit check${c.reset}`)
  console.log(`配置: ${configPath}`)
  console.log(`根目录: ${ROOT}`)
  console.log(`范围: ${scopeAll ? '工作区 vs HEAD' : '暂存区'}`)
  console.log(`测试: ${fullTests ? '全量' : runTests ? '按改动' : '跳过'}`)

  const files = getChangedFiles()
  const staged = getStagedFiles()

  if (!files.length && !staged.length) {
    warn('没有检测到改动')
    bumpWarn()
  } else {
    info(`改动 ${files.length} 个文件`)
  }

  checkSensitive(staged.length ? staged : files, cfg)
  checkApiAlignment(files, cfg)
  checkConnector(files, cfg)
  checkBugFixArchitecture(files, staged, cfg)
  checkBugLog(staged, cfg)
  checkArchitecture(files, cfg)

  if (auditPlugins || cfg.pluginCatalogAudit) {
    const audit = cfg.pluginCatalogAudit
    const stagedForAudit = staged.length ? staged : files
    const touched =
      audit &&
      ((audit.catalogPathPattern && matchesAny(stagedForAudit, audit.catalogPathPattern)) ||
        (audit.registryPathPattern && matchesAny(stagedForAudit, audit.registryPathPattern)))
    if (auditPlugins || touched) {
      checkPluginCatalogAudit(stagedForAudit, cfg)
    }
  }

  if (runTests || fullTests) {
    const reg = cfg.regressionTestDirPattern
    const frontend = cfg.testLayers?.find((l) => l.id === 'frontend')
    const bugsOnly =
      !fullTests &&
      reg &&
      matchesAny(files, reg) &&
      frontend?.excludeBugsPattern &&
      !matchesAny(files, frontend.excludeBugsPattern)

    if (fullTests) {
      for (const layer of cfg.testLayers ?? []) {
        if (layer.id === 'backend') continue
        if (!layer.workDir) continue
        const abs = path.join(ROOT, layer.workDir)
        if (layer.marker && !existsSync(path.join(abs, layer.marker))) continue
        section(`测试 · ${layer.id} (full)`)
        if (layer.typecheck) run(layer.typecheck, layer.workDir)
        if (layer.test) run(layer.test, layer.workDir)
        if (layer.testBugs && layer.id === 'frontend') run(layer.testBugs, layer.workDir)
      }
      const be = cfg.testLayers?.find((l) => l.id === 'backend')
      if (be) run(be.test ?? 'mvn test', be.workDir ?? 'datawise-backend')
    } else {
      runTestLayers(files, cfg, bugsOnly)
    }
  } else {
    section('7. 测试')
    info('跳过（加 --test 或 --full）')
  }

  section('结果')
  if (errors > 0) {
    fail(`${errors} 项失败`)
    process.exit(1)
  }
  if (warnings > 0) {
    warn(`${warnings} 项提醒`)
    process.exit(0)
  }
  ok('全部通过')
}

main()
