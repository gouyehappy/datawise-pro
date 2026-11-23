#!/usr/bin/env node
/**
 * DataWise 操作台 — 傻瓜式交互菜单
 *
 * 启动:
 *   ops.bat
 *   npm run menu
 *   scripts\desktop\ship-release.bat
 *
 * 设计原则:
 *   1. 首页只给「下一步推荐」+ 少量入口，不会用的人按 Enter / 1 即可
 *   2. 自动诊断发版状态，避免二次 bump、漏提交、工作日 hook 懵逼
 *   3. 危险操作二次确认；紧急 push 要输入 FORCE
 */
import {spawnSync} from 'node:child_process'
import {existsSync, readFileSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {stdin as input, stdout as output} from 'node:process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SHIP = join(ROOT, 'scripts', 'desktop', 'ship-release.mjs')
const DW = join(ROOT, 'scripts', 'dw.mjs')
const MIRROR = join(ROOT, 'scripts', 'desktop', 'mirror-to-cnb.mjs')
const isWin = process.platform === 'win32'

const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    white: '\x1b[37m',
    bg: '\x1b[44m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
}

/** @type {'home' | 'more' | 'dev' | 'git' | 'tools' | 'ship-manual'} */
let page = 'home'
let bump = process.argv[2] || 'patch'

const RELEASE_PATH_PREFIXES = [
    'package.json',
    'datawise-frontend/package.json',
    'datawise-frontend/package-lock.json',
    'datawise-desktop/pom.xml',
    'datawise-desktop/src/main/java/org/apache/datawise/desktop/',
    'datawise-frontend/src/features/layout/services/release-highlights.service.ts',
    'datawise-backend/',
]

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: opts.inherit === false ? 'pipe' : 'inherit',
        shell: opts.shell ?? false,
        windowsHide: true,
        env: process.env,
    })
    return r.status ?? 1
}

function runNode(args) {
    return run(process.execPath, args)
}

function runNpm(...npmArgs) {
    return run(isWin ? 'npm.cmd' : 'npm', npmArgs, {shell: isWin})
}

function git(args, opts = {}) {
    const r = spawnSync('git', args, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: opts.inherit ? 'inherit' : 'pipe',
        windowsHide: true,
    })
    if (opts.inherit) return r.status ?? 1
    if ((r.status ?? 1) !== 0) return ''
    return (r.stdout || '').trim()
}

function gitOk(args) {
    const r = spawnSync('git', args, {cwd: ROOT, encoding: 'utf8', windowsHide: true})
    return (r.status ?? 1) === 0
}

function readVersion() {
    try {
        const xml = readFileSync(join(ROOT, 'datawise-backend', 'pom.xml'), 'utf8')
        const m = xml.match(/<artifactId>datawise-backend<\/artifactId>\s*<version>([^<]+)<\/version>/)
        return m ? m[1].trim() : '?'
    } catch {
        return '?'
    }
}

function parseSemver(v) {
    const m = String(v).replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)$/)
    if (!m) return null
    return {major: +m[1], minor: +m[2], patch: +m[3], text: `${m[1]}.${m[2]}.${m[3]}`}
}

function nextBumpVersion(current, kind) {
    if (/^\d+\.\d+\.\d+$/.test(kind) || /^v\d+\.\d+\.\d+$/.test(kind)) {
        return String(kind).replace(/^v/, '')
    }
    const cur = parseSemver(current)
    if (!cur) return '?'
    if (kind === 'minor') return `${cur.major}.${cur.minor + 1}.0`
    if (kind === 'major') return `${cur.major + 1}.0.0`
    return `${cur.major}.${cur.minor}.${cur.patch + 1}`
}

function isWeekday() {
    const d = new Date().getDay()
    return d >= 1 && d <= 5
}

function isReleasePath(path) {
    const p = path.replace(/\\/g, '/')
    return RELEASE_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix))
}

function dirtyFiles() {
    const out = git(['status', '--porcelain'])
    if (!out) return []
    return out.split('\n').filter(Boolean).map((line) => {
        // XY PATH or XY ORIG -> PATH
        const path = line.slice(3).includes(' -> ') ? line.slice(3).split(' -> ').pop() : line.slice(3)
        return path.trim()
    })
}

function diagnose() {
    const version = readVersion()
    const tagName = version !== '?' ? `v${version}` : null
    const branch = git(['branch', '--show-current']) || '?'
    const latestTag = git(['describe', '--tags', '--abbrev=0']) || ''
    const dirty = dirtyFiles()
    const releaseDirty = dirty.filter(isReleasePath)
    const otherDirty = dirty.filter((p) => !isReleasePath(p))
    const localTag = tagName ? gitOk(['rev-parse', '-q', '--verify', `refs/tags/${tagName}`]) : false
    let remoteTag = false
    if (tagName) {
        // Network may fail offline — treat as "not on remote" and let push tell the truth later.
        const r = spawnSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tagName}`], {
            cwd: ROOT,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 12000,
        })
        const ls = (r.status === 0 ? r.stdout : '') || ''
        remoteTag = ls.includes(`refs/tags/${tagName}`)
    }
    const weekday = isWeekday()
    const next = nextBumpVersion(version, bump)
    const latestVer = latestTag.replace(/^v/, '')
    const sameAsLatest = latestVer && version === latestVer

    /** @type {{id: string, title: string, detail: string, action: string}} */
    let advice

    if (otherDirty.length) {
        advice = {
            id: 'commit-features',
            title: '请先提交功能/修复代码',
            detail: `还有 ${otherDirty.length} 个非发版文件未提交。发版向导不会动它们。`,
            action: '用 IDE / git 提交后，按 0 刷新',
        }
    } else if (releaseDirty.length) {
        advice = {
            id: 'commit-version',
            title: `提交版本号 ${version}`,
            detail: '版本文件已改但未提交。',
            action: '按 Enter 或 1 → 自动提交 chore(release)',
        }
    } else if (tagName && !localTag && !sameAsLatest) {
        advice = {
            id: 'push-tag',
            title: `推送并打 tag ${tagName}`,
            detail: weekday
                ? '工作日会被 hook 拦住，向导会用紧急 --no-verify（需确认）。'
                : '将 push 分支并推送 tag，触发 GitHub 打包。',
            action: '按 Enter 或 1 → 推送 + 打 tag',
        }
    } else if (tagName && localTag && !remoteTag) {
        advice = {
            id: 'push-tag-only',
            title: `推送已有 tag ${tagName}`,
            detail: '本地已有 tag，还没推到远端。',
            action: '按 Enter 或 1 → 推送 tag',
        }
    } else if (tagName && remoteTag && sameAsLatest) {
        advice = {
            id: 'cnb-or-next',
            title: `${tagName} 已在远端`,
            detail: '可镜像 CNB，或开始下一版。',
            action: '按 Enter → CNB；按 2 → 发下一版',
        }
    } else if (sameAsLatest || (tagName && remoteTag)) {
        advice = {
            id: 'ready-bump',
            title: `可以发下一版 ${next}`,
            detail: `当前 ${version} 已发布。默认 patch 升级。`,
            action: '按 Enter 或 1 → 一键 bump + 提交 + 推送 tag',
        }
    } else {
        advice = {
            id: 'ready-bump',
            title: `建议发版到 ${next}`,
            detail: `当前 ${version}，最近 tag ${latestTag || '(无)'}。`,
            action: '按 Enter 或 1 → 一键完成发版',
        }
    }

    return {
        version,
        tagName,
        branch,
        latestTag,
        dirty,
        releaseDirty,
        otherDirty,
        localTag,
        remoteTag,
        weekday,
        next,
        sameAsLatest,
        advice,
    }
}

function pause(msg = '按回车继续…') {
    return new Promise((resolve) => {
        const rl = createInterface({input, output})
        rl.question(`\n${c.dim}${msg}${c.reset}`, () => {
            rl.close()
            resolve()
        })
    })
}

function ask(prompt) {
    return new Promise((resolve) => {
        const rl = createInterface({input, output})
        rl.question(prompt, (ans) => {
            rl.close()
            resolve((ans || '').trim())
        })
    })
}

function clear() {
    output.write('\x1b[2J\x1b[H')
}

function line(n = 60) {
    return '─'.repeat(n)
}

async function readKey() {
    return new Promise((resolve) => {
        if (!input.isTTY) {
            const rl = createInterface({input, output})
            rl.question('', (ans) => {
                rl.close()
                resolve((ans || '1').trim().slice(0, 1) || '1')
            })
            return
        }
        const wasRaw = input.isRaw
        input.setRawMode(true)
        input.resume()
        input.once('data', (buf) => {
            input.setRawMode(!!wasRaw)
            const s = buf.toString('utf8')
            if (s === '\u0003') {
                resolve('q')
                return
            }
            // Enter = default action
            if (s === '\r' || s === '\n') {
                resolve('enter')
                return
            }
            resolve(s.replace(/\r|\n/g, '').slice(0, 1))
        })
    })
}

function printHome(d) {
    clear()
    console.log()
    console.log(`${c.bg}${c.white}${c.bold}  DataWise 操作台  ${c.reset}  ${c.dim}傻瓜式 · 跟推荐走即可${c.reset}`)
    console.log(`${c.dim}${line()}${c.reset}`)
    console.log(
        `  版本 ${c.cyan}${c.bold}${d.version}${c.reset}` +
            `  ·  分支 ${d.branch}` +
            `  ·  最近 tag ${c.dim}${d.latestTag || '(无)'}${c.reset}`,
    )
    console.log(
        `  工作区 ${
            d.dirty.length === 0
                ? `${c.green}干净 ✓${c.reset}`
                : `${c.yellow}${d.dirty.length} 个改动${c.reset}`
        }` +
            (d.weekday
                ? `  ·  ${c.yellow}工作日（push 需紧急确认）${c.reset}`
                : `  ·  ${c.green}周末可正常 push${c.reset}`),
    )
    console.log(`${c.dim}${line()}${c.reset}`)
    console.log()
    console.log(`  ${c.bgGreen}${c.bold} 下一步推荐 ${c.reset}`)
    console.log()
    console.log(`  ${c.bold}${d.advice.title}${c.reset}`)
    console.log(`  ${d.advice.detail}`)
    console.log(`  ${c.cyan}${d.advice.action}${c.reset}`)
    console.log()
    console.log(`${c.dim}${line()}${c.reset}`)
    console.log()
    console.log(`  ${c.green}${c.bold}Enter / 1${c.reset}  执行推荐步骤`)
    if (d.advice.id === 'cnb-or-next' || d.advice.id === 'ready-bump') {
        console.log(`  ${c.cyan}2${c.reset}          发下一版 ${d.next}（一键）`)
        console.log(`  ${c.cyan}3${c.reset}          只做 CNB 镜像`)
    }
    console.log(`  ${c.cyan}H${c.reset}          这是什么？简短说明`)
    console.log(`  ${c.cyan}M${c.reset}          更多功能（开发 / Git / 手动发版）`)
    console.log(`  ${c.cyan}0${c.reset}          刷新状态`)
    console.log(`  ${c.cyan}Q${c.reset}          退出`)
    console.log()
    console.log(`${c.dim}${line()}${c.reset}`)
    output.write(`  ${c.bold}请按键${c.reset} ${c.dim}(Enter=推荐)${c.reset} `)
}

async function confirmYes(label = '确认执行？') {
    const yn = await ask(`${label} 输入 ${c.green}Y${c.reset} 继续，其它取消: `)
    return yn.toLowerCase() === 'y'
}

async function confirmForce() {
    console.log(`\n${c.yellow}工作日 push 会被本机 hook 拦截。${c.reset}`)
    console.log('将使用 git push --no-verify（仅紧急发版）。\n')
    const conf = await ask(`请输入 ${c.red}FORCE${c.reset} 确认紧急推送: `)
    return conf === 'FORCE'
}

async function showHelp() {
    clear()
    console.log(`
${c.bold}怎么用（不会命令也行）${c.reset}

  1. 双击 ${c.cyan}ops.bat${c.reset} 或运行 npm run menu
  2. 看绿色「下一步推荐」
  3. 按 ${c.green}回车${c.reset} 执行

${c.bold}发一版桌面包的正常顺序${c.reset}

  · 功能代码先自己 commit 干净
  · 回车让向导：升版本 → 提交 → 推送 tag
  · 等 GitHub Actions 打好包
  · 再回车做 CNB 镜像（要设 CNB_TOKEN）

${c.bold}版本怎么定${c.reset}

  · 修 bug → patch（5.0.0 → 5.0.1）← 默认
  · 新功能 → minor（5.1.0）
  · 大改   → major（6.0.0）
  在「更多 → 手动发版 → B」可改

${c.bold}工作日推送${c.reset}

  本机 hook 工作日禁止 push。向导会提示输入 FORCE 紧急绕过。
`)
    await pause()
}

async function doCommitVersion(d) {
    clear()
    console.log(`\n${c.bold}提交版本号 ${d.version}${c.reset}\n`)
    if (!(await confirmYes('提交 chore(release)？'))) {
        console.log('已取消。')
        await pause()
        return
    }
    const code = runNode([SHIP, '--bump', d.version, '--step', 'commit'])
    console.log(code === 0 ? `\n${c.green}✓ 已提交。下一步：推送 tag。${c.reset}` : `\n${c.red}失败。${c.reset}`)
    await pause()
}

async function doPushTag(d, {createTag = true} = {}) {
    clear()
    const tag = d.tagName
    console.log(`\n${c.bold}${createTag ? '推送分支并打 tag' : '推送 tag'} ${tag}${c.reset}\n`)

    let noVerify = false
    if (d.weekday) {
        if (!(await confirmForce())) {
            console.log('已取消。')
            await pause()
            return
        }
        noVerify = true
    } else if (!(await confirmYes('确认 push？'))) {
        console.log('已取消。')
        await pause()
        return
    }

    if (createTag && !d.localTag) {
        const args = [SHIP, '--bump', d.version, '--step', 'tag', '--yes']
        if (noVerify) args.push('--no-verify')
        const code = runNode(args)
        console.log(code === 0 ? `\n${c.green}✓ 已推送 ${tag}，CI 打包中。${c.reset}` : `\n${c.red}失败。${c.reset}`)
        if (code === 0) {
            console.log(`${c.dim}完成后回操作台，推荐会变成「镜像 CNB」。${c.reset}`)
        }
        await pause()
        return
    }

    // tag exists locally — push only
    const branch = d.branch
    const pushExtra = noVerify ? ['--no-verify'] : []
    let code = git(['push', ...pushExtra, 'origin', `HEAD:refs/heads/${branch}`], {inherit: true})
    if (code !== 0) {
        console.log(`\n${c.red}分支 push 失败。${c.reset}`)
        await pause()
        return
    }
    code = git(['push', ...pushExtra, 'origin', tag], {inherit: true})
    console.log(code === 0 ? `\n${c.green}✓ tag 已推送。${c.reset}` : `\n${c.red}失败。${c.reset}`)
    await pause()
}

async function doFullShip(d) {
    clear()
    const target = d.next
    console.log(`\n${c.bold}一键发版 → ${target}（tag v${target}）${c.reset}\n`)
    console.log('将依次：提升版本号 → 提交 → push 分支 + 打 tag\n')
    console.log(`${c.dim}要求：工作区干净（功能改动已提交）。${c.reset}\n`)

    let noVerify = false
    if (d.weekday) {
        if (!(await confirmForce())) {
            console.log('已取消。')
            await pause()
            return
        }
        noVerify = true
    } else if (!(await confirmYes(`确认发 v${target}？`))) {
        console.log('已取消。')
        await pause()
        return
    }

    const args = [SHIP, '--bump', bump, '--yes']
    if (noVerify) args.push('--no-verify')
    const code = runNode(args)
    console.log(
        code === 0
            ? `\n${c.green}✓ 发版完成。等 GitHub Actions 打好包后再做 CNB。${c.reset}`
            : `\n${c.red}失败。可按 0 刷新后看新的推荐。${c.reset}`,
    )
    await pause()
}

async function doCnb(d) {
    clear()
    console.log(`\n${c.bold}镜像到 CNB${c.reset}\n`)
    if (!process.env.CNB_TOKEN) {
        console.log(`${c.yellow}未设置环境变量 CNB_TOKEN。${c.reset}`)
        console.log('先在本机执行:  set CNB_TOKEN=你的令牌\n')
    }
    const defaultTag = d.tagName || `v${d.version}`
    let tag = await ask(`要镜像的 tag（回车 = ${defaultTag}）: `)
    if (!tag) tag = defaultTag
    if (!(await confirmYes(`确认镜像 ${tag}？`))) {
        console.log('已取消。')
        await pause()
        return
    }
    if (!existsSync(MIRROR)) {
        console.log(`${c.red}找不到 mirror 脚本。${c.reset}`)
        await pause()
        return
    }
    const code = runNode([MIRROR, '--tag', tag])
    console.log(code === 0 ? `\n${c.green}✓ 完成。${c.reset}` : `\n${c.red}失败。检查 token 与 Release 产物。${c.reset}`)
    await pause()
}

async function runRecommended(d) {
    switch (d.advice.id) {
        case 'commit-features':
            clear()
            console.log(`\n${c.yellow}请先提交这些文件（向导不会自动 commit 功能代码）：${c.reset}\n`)
            for (const f of d.otherDirty.slice(0, 30)) console.log(`  · ${f}`)
            if (d.otherDirty.length > 30) console.log(`  … 共 ${d.otherDirty.length} 个`)
            console.log(`\n提交干净后按 0 刷新，会自动给出下一步。`)
            await pause()
            break
        case 'commit-version':
            await doCommitVersion(d)
            break
        case 'push-tag':
            await doPushTag(d, {createTag: true})
            break
        case 'push-tag-only':
            await doPushTag(d, {createTag: false})
            break
        case 'cnb-or-next':
            await doCnb(d)
            break
        case 'ready-bump':
            await doFullShip(d)
            break
        default:
            await showHelp()
    }
}

function printMore() {
    clear()
    console.log()
    console.log(`${c.bg}${c.white}${c.bold}  更多功能  ${c.reset}`)
    console.log(`${c.dim}${line()}${c.reset}`)
    console.log()
    console.log(`  ${c.cyan}1${c.reset}  日常开发          ${c.dim}dev / 打包 / 停止${c.reset}`)
    console.log(`  ${c.cyan}2${c.reset}  Git 推送          ${c.dim}含紧急 --no-verify${c.reset}`)
    console.log(`  ${c.cyan}3${c.reset}  手动发版步骤      ${c.dim}逐步 bump/commit/tag${c.reset}`)
    console.log(`  ${c.cyan}4${c.reset}  检查与工具`)
    console.log()
    console.log(`  ${c.cyan}M${c.reset}  返回首页   ${c.cyan}Q${c.reset}  退出`)
    console.log()
    output.write(`  ${c.bold}请按键${c.reset} `)
}

function printDev() {
    clear()
    console.log(`\n${c.bold}日常开发${c.reset}\n`)
    console.log(`  ${c.cyan}D${c.reset}  开发联调     ${c.cyan}S${c.reset}  停止`)
    console.log(`  ${c.cyan}F${c.reset}  前端打包     ${c.cyan}K${c.reset}  后端打包`)
    console.log(`  ${c.cyan}P${c.reset}  插件         ${c.cyan}L${c.reset}  桌面安装包`)
    console.log(`  ${c.cyan}C${c.reset}  清理`)
    console.log(`\n  ${c.cyan}M${c.reset}  返回\n`)
    output.write(`  ${c.bold}请按键${c.reset} `)
}

function printGit() {
    const d = diagnose()
    clear()
    console.log(`\n${c.bold}Git 推送${c.reset}  ${c.dim}${d.branch}${c.reset}\n`)
    console.log(`  ${c.cyan}1${c.reset}  普通 push 分支`)
    console.log(`  ${c.cyan}2${c.reset}  紧急 push 分支   ${c.yellow}--no-verify${c.reset}`)
    console.log(`  ${c.cyan}3${c.reset}  推送 tag ${d.tagName || ''}`)
    console.log(`  ${c.cyan}4${c.reset}  紧急推送 tag     ${c.yellow}--no-verify${c.reset}`)
    console.log(`  ${c.cyan}5${c.reset}  status   ${c.cyan}6${c.reset}  最近提交`)
    console.log(`\n  ${c.cyan}M${c.reset}  返回\n`)
    output.write(`  ${c.bold}请按键${c.reset} `)
}

function printShipManual() {
    const d = diagnose()
    clear()
    console.log(`\n${c.bold}手动发版${c.reset}  当前 ${d.version} · bump=${bump} → ${d.next}\n`)
    console.log(`  ${c.cyan}1${c.reset}  检查   ${c.cyan}2${c.reset}  bump   ${c.cyan}3${c.reset}  提交`)
    console.log(`  ${c.cyan}4${c.reset}  tag    ${c.cyan}5${c.reset}  CNB    ${c.cyan}E${c.reset}  紧急 tag`)
    console.log(`  ${c.cyan}A${c.reset}  一键   ${c.cyan}B${c.reset}  改 bump`)
    console.log(`\n  ${c.cyan}M${c.reset}  返回\n`)
    output.write(`  ${c.bold}请按键${c.reset} `)
}

function printTools() {
    clear()
    console.log(`\n${c.bold}检查与工具${c.reset}\n`)
    console.log(`  ${c.cyan}1${c.reset}  版本对齐检查`)
    console.log(`  ${c.cyan}2${c.reset}  发版状态`)
    console.log(`  ${c.cyan}3${c.reset}  命令帮助 (dw help)`)
    console.log(`  ${c.cyan}4${c.reset}  前端 typecheck`)
    console.log(`\n  ${c.cyan}M${c.reset}  返回\n`)
    output.write(`  ${c.bold}请按键${c.reset} `)
}

async function runDw(cmd) {
    clear()
    console.log(`\n${c.bold}${cmd}${c.reset}\n`)
    const code = runNode([DW, cmd])
    console.log(code === 0 ? `\n${c.green}✓${c.reset}` : `\n${c.red}退出码 ${code}${c.reset}`)
    await pause()
}

async function gitPushBranch(noVerify) {
    clear()
    const branch = git(['branch', '--show-current']) || 'HEAD'
    console.log(`\npush ${branch}${noVerify ? ' --no-verify' : ''}\n`)
    if (noVerify) {
        if (!(await confirmForce())) {
            await pause()
            return
        }
    } else if (!(await confirmYes())) {
        await pause()
        return
    }
    const args = noVerify
        ? ['push', '--no-verify', 'origin', `HEAD:refs/heads/${branch}`]
        : ['push', 'origin', `HEAD:refs/heads/${branch}`]
    const code = git(args, {inherit: true})
    console.log(code === 0 ? `\n${c.green}✓${c.reset}` : `\n${c.red}失败${c.reset}`)
    await pause()
}

async function changeBump() {
    clear()
    console.log(`\n当前 bump=${bump}\n可输入: patch / minor / major / 或 5.0.2\n`)
    const nb = await ask('新的 bump: ')
    if (nb) bump = nb
    console.log(`已设为 ${bump} → 下一版 ${nextBumpVersion(readVersion(), bump)}`)
    await pause()
}

async function handleHome(key, d) {
    if (key === 'enter' || key === '1') {
        await runRecommended(d)
        return
    }
    if (key === '2') {
        await doFullShip(d)
        return
    }
    if (key === '3') {
        await doCnb(d)
        return
    }
    if (key === 'h') {
        await showHelp()
        return
    }
    if (key === 'm') {
        page = 'more'
        return
    }
    if (key === '0') return
}

async function handleMore(key) {
    if (key === '1') page = 'dev'
    else if (key === '2') page = 'git'
    else if (key === '3') page = 'ship-manual'
    else if (key === '4') page = 'tools'
    else if (key === 'm' || key === 'enter') page = 'home'
}

async function handleDev(key) {
    if (key === 'm' || key === 'enter') page = 'more'
    else if (key === 'd') await runDw('dev')
    else if (key === 's') await runDw('stop')
    else if (key === 'f') await runDw('frontend')
    else if (key === 'k') await runDw('backend')
    else if (key === 'p') await runDw('plugins')
    else if (key === 'l') await runDw('dist')
    else if (key === 'c') await runDw('clean')
}

async function handleGit(key) {
    const d = diagnose()
    if (key === 'm' || key === 'enter') page = 'more'
    else if (key === '1') await gitPushBranch(false)
    else if (key === '2') await gitPushBranch(true)
    else if (key === '3') await doPushTag(d, {createTag: !d.localTag})
    else if (key === '4') {
        // force path
        clear()
        if (!(await confirmForce())) {
            await pause()
            return
        }
        const tag = d.tagName
        if (!d.localTag) {
            runNode([SHIP, '--bump', d.version, '--step', 'tag', '--yes', '--no-verify'])
        } else {
            git(['push', '--no-verify', 'origin', `HEAD:refs/heads/${d.branch}`], {inherit: true})
            git(['push', '--no-verify', 'origin', tag], {inherit: true})
        }
        await pause()
    } else if (key === '5') {
        clear()
        git(['status'], {inherit: true})
        await pause()
    } else if (key === '6') {
        clear()
        git(['log', '-8', '--oneline', '--decorate'], {inherit: true})
        await pause()
    }
}

async function handleShipManual(key) {
    const d = diagnose()
    if (key === 'm') page = 'more'
    else if (key === '1') {
        clear()
        runNode([SHIP, '--step', 'status'])
        await pause()
    } else if (key === '2') {
        clear()
        runNode([SHIP, '--bump', bump, '--step', 'bump'])
        await pause()
    } else if (key === '3') await doCommitVersion(d)
    else if (key === '4') await doPushTag(d, {createTag: true})
    else if (key === '5') await doCnb(d)
    else if (key === 'e') {
        d.weekday = true
        await doPushTag(d, {createTag: true})
    } else if (key === 'a') await doFullShip(d)
    else if (key === 'b') await changeBump()
}

async function handleTools(key) {
    if (key === 'm' || key === 'enter') page = 'more'
    else if (key === '1') {
        clear()
        runNpm('run', 'check:version-alignment')
        await pause()
    } else if (key === '2') {
        clear()
        runNode([SHIP, '--step', 'status'])
        await pause()
    } else if (key === '3') {
        clear()
        runNode([DW, 'help'])
        await pause()
    } else if (key === '4') {
        clear()
        runNpm('run', 'typecheck:frontend')
        await pause()
    }
}

async function main() {
    for (;;) {
        const d = diagnose()
        if (page === 'home') printHome(d)
        else if (page === 'more') printMore()
        else if (page === 'dev') printDev()
        else if (page === 'git') printGit()
        else if (page === 'ship-manual') printShipManual()
        else if (page === 'tools') printTools()

        const key = (await readKey()).toLowerCase()
        output.write('\n')
        if (key === 'q' || key === '\u001b') {
            clear()
            console.log('\n已退出。下次直接双击 ops.bat 即可。\n')
            break
        }
        if (page === 'home') await handleHome(key, d)
        else if (page === 'more') await handleMore(key)
        else if (page === 'dev') await handleDev(key)
        else if (page === 'git') await handleGit(key)
        else if (page === 'ship-manual') await handleShipManual(key)
        else if (page === 'tools') await handleTools(key)
    }
}

main().catch((e) => {
    console.error(e.message || e)
    process.exitCode = 1
})
