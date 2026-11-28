#!/usr/bin/env node
/**
 * DataWise 操作台 — 给非技术同事也能用的发版/开发助手
 *
 * 启动: 双击仓库根目录 ops.bat
 */
import {spawnSync} from 'node:child_process'
import {existsSync, readFileSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {stdin as input, stdout as output} from 'node:process'
import {launchInNewWindow} from './ops-runner.mjs'
import {closeOps} from './ops-close.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SHIP = join(ROOT, 'scripts', 'desktop', 'ship-release.mjs')
const DW = join(ROOT, 'scripts', 'dw.mjs')
const MIRROR = join(ROOT, 'scripts', 'desktop', 'mirror-to-cnb.mjs')
const PUSH_CNB = join(ROOT, 'scripts', 'desktop', 'push-code-to-cnb.mjs')
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
    bgCyan: '\x1b[46m',
}

/** @type {'home' | 'more' | 'dev' | 'build' | 'upload' | 'manual' | 'tools' | 'quality' | 'plugins'} */
let page = 'home'
/** patch = 修 bug 小升级；也可改成具体号如 5.0.2 */
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

/**
 * Launch a command in a separate console; keep this ops menu responsive.
 * @param {string} title
 * @param {string[]} argv
 * @param {{hint?: string}} [opts]
 */
async function runExternal(title, argv, opts = {}) {
    clear()
    console.log(`\n${c.bold}${title}${c.reset}`)
    console.log(`\n  ${c.dim}${argv.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}${c.reset}\n`)
    const ok = launchInNewWindow(title, argv)
    if (ok) {
        console.log(`  ${c.green}已在新窗口启动。${c.reset}`)
        console.log(`  ${c.dim}请到新窗口查看输出；本菜单窗口继续可用。${c.reset}`)
    } else {
        console.log(`  ${c.red}无法打开新窗口，请在本机终端手动执行上述命令。${c.reset}`)
    }
    if (opts.hint) {
        console.log()
        console.log(`  ${c.yellow}${opts.hint}${c.reset}`)
    }
    console.log()
    await pause()
}

/** Short commands (如 stop) 在本窗口同步执行，保证看得到结果。 */
async function runInline(title, argv) {
    clear()
    console.log(`\n${c.bold}${title}${c.reset}`)
    console.log(`\n  ${c.dim}${argv.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}${c.reset}\n`)
    const [cmd, ...args] = argv
    /** @param {string} s */
    const q = (s) => (/[ \t"&<>|^%]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s))
    // Windows *.cmd 经 cmd /c，避免 Node 24 EINVAL / DEP0190
    const r =
        isWin && /\.cmd$/i.test(cmd)
            ? spawnSync('cmd.exe', ['/d', '/s', '/c', [cmd, ...args].map(q).join(' ')], {
                  cwd: ROOT,
                  stdio: 'inherit',
                  shell: false,
                  env: process.env,
                  windowsHide: false,
              })
            : spawnSync(cmd, args, {
                  cwd: ROOT,
                  stdio: 'inherit',
                  shell: false,
                  env: process.env,
                  windowsHide: false,
              })
    const code = r.status ?? (r.error ? 1 : 0)
    if (r.error) console.error(r.error.message || r.error)
    console.log(
        code === 0
            ? `\n${c.green}✓ 完成${c.reset}`
            : `\n${c.red}✗ 未成功（代码 ${code}）${c.reset}`,
    )
    await pause()
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

function weekdayName() {
    return ['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()]
}

function isReleasePath(path) {
    const p = path.replace(/\\/g, '/')
    return RELEASE_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix))
}

function dirtyFiles() {
    const out = git(['status', '--porcelain'])
    if (!out) return []
    return out.split('\n').filter(Boolean).map((line) => {
        const path = line.slice(3).includes(' -> ') ? line.slice(3).split(' -> ').pop() : line.slice(3)
        return path.trim()
    })
}

/**
 * 把技术状态翻成「人话」建议
 */
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
    const sameAsLatest = Boolean(latestVer && version === latestVer)

    /** 发版流水线进度 1~4 */
    let step = 1
    if (otherDirty.length) step = 1
    else if (releaseDirty.length) step = 2
    else if (tagName && (!localTag || !remoteTag) && !sameAsLatest) step = 3
    else if (tagName && remoteTag) step = 4
    else step = 2

    /** @type {{id: string, title: string, why: string, what: string, tip: string}} */
    let advice

    if (otherDirty.length) {
        advice = {
            id: 'commit-features',
            title: '先把「改过的功能」存档',
            why: '电脑里还有还没存档的修改。不先存好，就不能安心发新版本（怕把半成品发出去）。',
            what: '请让熟悉代码的同事，用 Cursor / VS Code 把改动「提交（Commit）」完。',
            tip: '存档完成后回到这里，按 0 刷新，绿色推荐会自动变成下一步。',
        }
    } else if (releaseDirty.length) {
        advice = {
            id: 'commit-version',
            title: `把版本号 ${version} 存档`,
            why: '版本号已经改好了，但还没存进版本库。',
            what: '按回车后，本工具会自动帮你存档（写一句「版本升到 xxx」的记录）。',
            tip: '你只需要输入 Y 确认即可。',
        }
    } else if (tagName && !localTag && !sameAsLatest) {
        advice = {
            id: 'push-tag',
            title: `把 ${version} 上传并通知云端打包`,
            why: '本地版本号已经是新的，但网上还没有「正式发版标记」，云端电脑不会开始打安装包。',
            what: weekday
                ? '今天是工作日，公司规定平时不能随便上传。按回车后会要求你输入 FORCE 做一次紧急上传。'
                : '按回车后会上传代码，并打上正式标记，云端开始做 Windows/Mac 安装包。',
            tip: '上传成功后，请到 GitHub Actions 等十几分钟看打包是否成功。',
        }
    } else if (tagName && localTag && !remoteTag) {
        advice = {
            id: 'push-tag-only',
            title: `把发版标记 ${tagName} 传到网上`,
            why: '标记只在你这台电脑上，云端还不知道，所以还不会打包。',
            what: weekday
                ? '工作日需紧急上传：按回车后输入 FORCE。'
                : '按回车即可上传标记。',
            tip: '成功后云端会开始打包。',
        }
    } else if (tagName && remoteTag && sameAsLatest) {
        advice = {
            id: 'cnb-or-next',
            title: `${version} 已经发到网上了`,
            why: '正式标记已在云端。若国内下载慢，可再同步一份到 CNB 镜像。',
            what: '按回车 → 同步到 CNB（需事先设置令牌）；按 2 → 开始做下一个版本。',
            tip: '同步前请确认 GitHub 上的安装包已经生成完毕。',
        }
    } else if (sameAsLatest || (tagName && remoteTag)) {
        advice = {
            id: 'ready-bump',
            title: `可以发布下一版 ${next}`,
            why: `现在线上/本地正式版是 ${version}。修完 bug 后，一般把最后一位数字 +1（例如 5.0.0 → 5.0.1）。`,
            what: '按回车将自动：改版本号 → 存档 → 上传并通知云端打包。',
            tip: weekday
                ? '今天是工作日，过程中会要求输入 FORCE 才能上传。'
                : '全程跟提示输入 Y 即可。',
        }
    } else {
        advice = {
            id: 'ready-bump',
            title: `建议发布到 ${next}`,
            why: `当前写在项目里的版本是 ${version}，最近一次正式标记是 ${latestTag || '还没有'}。`,
            what: '按回车一键完成升版本、存档、上传打包通知。',
            tip: '不确定就保持默认（小版本 +1），一般修 bug 都用这个。',
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
        step,
        advice,
    }
}

function pause(msg = '看完后按回车返回…') {
    return new Promise((resolve) => {
        const rl = createInterface({input, output})
        rl.question(`\n${c.dim}${msg}${c.reset}`, () => {
            rl.close()
            // readline 会 pause stdin；不 resume 的话下一次 readKey 可能卡住，用户 Ctrl+C → 菜单 exit -1
            try {
                input.resume()
            } catch {
                // ignore
            }
            resolve()
        })
    })
}

function ask(prompt) {
    return new Promise((resolve) => {
        const rl = createInterface({input, output})
        rl.question(prompt, (ans) => {
            rl.close()
            try {
                input.resume()
            } catch {
                // ignore
            }
            resolve((ans || '').trim())
        })
    })
}

function clear() {
    output.write('\x1b[2J\x1b[H')
}

function line(n = 62) {
    return '─'.repeat(n)
}

function isInteractiveTerminal() {
    return Boolean(input.isTTY && output.isTTY)
}

async function readKey() {
    return new Promise((resolve, reject) => {
        // 非交互环境不要自动当成按「1」，否则会狂刷/闪退
        if (!isInteractiveTerminal()) {
            resolve('q')
            return
        }
        try {
            const wasRaw = input.isRaw
            input.setRawMode(true)
            input.resume()
            input.once('data', (buf) => {
                try {
                    input.setRawMode(!!wasRaw)
                } catch {
                    // ignore
                }
                const s = buf.toString('utf8')
                if (s === '\u0003') {
                    resolve('q')
                    return
                }
                if (s === '\r' || s === '\n') {
                    resolve('enter')
                    return
                }
                resolve(s.replace(/\r|\n/g, '').slice(0, 1))
            })
        } catch (e) {
            reject(e)
        }
    })
}

function pipelineBar(step) {
    const items = [
        {n: 1, label: '存好改动'},
        {n: 2, label: '升版本号'},
        {n: 3, label: '上传打包'},
        {n: 4, label: '国内镜像'},
    ]
    return items
        .map((it) => {
            if (it.n < step) return `${c.green}✓${it.label}${c.reset}`
            if (it.n === step) return `${c.bgGreen}${c.bold} ${it.n}.${it.label} ${c.reset}`
            return `${c.dim}${it.n}.${it.label}${c.reset}`
        })
        .join(` ${c.dim}→${c.reset} `)
}

function printHome(d) {
    clear()
    console.log()
    console.log(`${c.bg}${c.white}${c.bold}  DataWise 小助手  ${c.reset}`)
    console.log(`  ${c.dim}不会命令也没关系：看绿色「现在该做什么」，然后按回车。${c.reset}`)
    console.log(`${c.dim}${line()}${c.reset}`)
    console.log(`  软件版本号   ${c.cyan}${c.bold}${d.version}${c.reset}     ${c.dim}（写在项目里的号）${c.reset}`)
    console.log(`  网上已发布   ${c.dim}${d.latestTag || '还没有正式标记'}${c.reset}`)
    console.log(`  今天         星期${weekdayName()}${d.weekday ? `  ${c.yellow}（工作日上传需额外确认）${c.reset}` : `  ${c.green}（周末可正常上传）${c.reset}`}`)
    console.log(
        `  本地改动     ${
            d.dirty.length === 0
                ? `${c.green}没有未存档的修改 ✓${c.reset}`
                : `${c.yellow}还有 ${d.dirty.length} 处未存档${c.reset}`
        }`,
    )
    console.log(`${c.dim}${line()}${c.reset}`)
    console.log(`  发版进度  ${pipelineBar(d.step)}`)
    console.log(`${c.dim}${line()}${c.reset}`)
    console.log()
    console.log(`  ${c.bgGreen}${c.bold}  现在该做什么  ${c.reset}`)
    console.log()
    console.log(`  ${c.bold}${d.advice.title}${c.reset}`)
    console.log()
    console.log(`  ${c.dim}为什么${c.reset}`)
    console.log(`  ${d.advice.why}`)
    console.log()
    console.log(`  ${c.dim}你要做的${c.reset}`)
    console.log(`  ${d.advice.what}`)
    console.log()
    console.log(`  ${c.cyan}${d.advice.tip}${c.reset}`)
    console.log()
    console.log(`${c.dim}${line()}${c.reset}`)
    console.log()
    console.log(`  ${c.green}${c.bold}【回车】或【1】${c.reset}  按推荐继续（最常用）`)
    if (d.advice.id === 'cnb-or-next' || d.advice.id === 'ready-bump') {
        console.log(`  ${c.cyan}【2】${c.reset}              发布下一版 ${d.next}`)
        console.log(`  ${c.cyan}【3】${c.reset}              同步安装包到国内镜像 (CNB)`)
    }
    console.log(`  ${c.cyan}【4】${c.reset}              先把代码推到 CNB（空仓必做）`)
    console.log(`  ${c.cyan}【H】${c.reset}              说明书（术语对照 + 全流程）`)
    console.log(`  ${c.cyan}【M】${c.reset}              更多：开发调试 / 手动上传 / 工具`)
    console.log(`  ${c.cyan}【0】${c.reset}              刷新状态`)
    console.log(`  ${c.cyan}【Q】${c.reset}              退出并关闭本窗口（顺带清 ops 网页端口）`)
    console.log(`  ${c.dim}停联调（Vite/后端）：更多→开发→S 或双击 stop.bat${c.reset}`)
    console.log()
    console.log(`${c.dim}${line()}${c.reset}`)
    output.write(`  ${c.bold}请按键${c.reset} ${c.dim}（直接回车 = 按推荐做）${c.reset} `)
}

async function showGuide() {
    clear()
    console.log(`
${c.bgCyan}${c.bold}  DataWise 发版说明书（给非技术同事）  ${c.reset}

${c.bold}一、这个小助手是干什么的？${c.reset}
  帮你把「修好的软件」变成「用户能下载的安装包」。
  你不用记命令，跟着绿色提示按回车就行。

${c.bold}二、发一版大概分 4 步${c.reset}
  ① 存好改动     程序员把代码修改存进版本库（Commit）
  ② 升版本号     例如 5.0.0 → 5.0.1（修 bug 通常 +0.0.1）
  ③ 上传打包     传到 GitHub，云端电脑自动打安装包
  ④ 国内镜像     可选：先【推代码到 CNB】（空仓必做），再拷安装包

${c.bold}三、名词对照（别被英文吓到）${c.reset}
  版本号 / version     软件第几版，如 5.0.1
  存档 / commit        把修改记一笔「今天改了什么」
  上传 / push          把本地记录发到网上的代码仓库
  发版标记 / tag       给这一刻贴标签，如 v5.0.1，表示正式版
  云端打包 / Actions   网上的电脑自动编译安装程序
  紧急上传 / FORCE     工作日平时禁止上传；紧急发版时输入 FORCE 放行
  CNB 镜像             国内备份下载点（需要事先准备令牌 CNB_TOKEN）

${c.bold}四、版本号怎么加？${c.reset}
  修 bug、小改动     →  最后一位 +1    5.0.0 → 5.0.1   ${c.green}（默认，最常用）${c.reset}
  加了一块新功能     →  中间位 +1      5.0.1 → 5.1.0
  大改、不兼容旧版   →  第一位 +1      5.1.0 → 6.0.0

${c.bold}五、日常怎么打开？${c.reset}
  双击仓库里的 ${c.cyan}ops.bat${c.reset}
  或在项目目录打开终端，输入：npm run menu
  首页管发版；按 ${c.cyan}M${c.reset} 进入「全部功能」：开发 / 编译 / Git / 检查 / 插件。

${c.bold}六、出问题怎么办？${c.reset}
  · 提示「还有未存档」→ 找开发同事先 Commit
  · 提示输入 FORCE → 确认是紧急发版再输入（区分大小写）
  · 上传成功但没有安装包 → 打开 GitHub → Actions 看是否还在跑或失败
  · 完全不懂 → 把本窗口截图发给开发同事
`)
    await pause()
}

async function confirmYes(label = '确认继续吗？') {
    const yn = await ask(`\n${label}\n请输入 ${c.green}Y${c.reset} 然后回车（其它键取消）: `)
    return yn.toLowerCase() === 'y'
}

async function confirmForce() {
    console.log(`
${c.bgYellow}${c.bold}  工作日保护  ${c.reset}
  公司规定：周一到周五平时不能随便把代码传到网上。
  如果你确定「现在必须发版」，请输入大写 FORCE 临时放行。
  如果只是误点，直接回车取消即可。
`)
    const conf = await ask(`请输入 ${c.red}FORCE${c.reset} 确认紧急上传: `)
    return conf === 'FORCE'
}

async function explainThen(title, paragraphs) {
    clear()
    console.log(`\n${c.bg}${c.white}${c.bold}  ${title}  ${c.reset}\n`)
    for (const p of paragraphs) {
        console.log(`  ${p}`)
        console.log()
    }
}

async function doCommitVersion(d) {
    await explainThen('存档版本号', [
        `将把软件版本号 ${c.bold}${d.version}${c.reset} 的修改写入版本库。`,
        '就像在本子上记一笔：「今天版本改成了这个号」。',
        '不会上传到网上，只是存在你这台电脑的项目记录里。',
    ])
    if (!(await confirmYes('确认存档版本号？'))) {
        console.log('已取消，没有做任何修改。')
        await pause()
        return
    }
    await runExternal('存档版本号', [process.execPath, SHIP, '--bump', d.version, '--step', 'commit'])
}

async function doPushTag(d, {createTag = true} = {}) {
    await explainThen(createTag ? '上传并通知云端打包' : '上传发版标记', [
        `目标版本：${c.bold}${d.version}${c.reset}（标记名 ${d.tagName}）`,
        '这一步会把代码记录发到 GitHub，并贴上「正式版」标签。',
        '贴标成功后，网上的自动流水线会开始制作安装包（可能要等 10～30 分钟）。',
        d.weekday
            ? '今天是工作日，需要额外输入 FORCE 才能上传。'
            : '今天是周末，按正常确认即可。',
    ])

    let noVerify = false
    if (d.weekday) {
        if (!(await confirmForce())) {
            console.log('已取消。')
            await pause()
            return
        }
        noVerify = true
    } else if (!(await confirmYes('确认上传到网上？'))) {
        console.log('已取消。')
        await pause()
        return
    }

    if (createTag && !d.localTag) {
        const args = [SHIP, '--bump', d.version, '--step', 'tag', '--yes']
        if (noVerify) args.push('--no-verify')
        await runExternal('上传并打标记', [process.execPath, ...args])
        return
    }

    const pushExtra = noVerify ? ['--no-verify'] : []
    const nv = pushExtra.join(' ')
    const chain = `git push ${nv} origin HEAD:refs/heads/${d.branch} && git push ${nv} origin ${d.tagName}`.replace(/  +/g, ' ')
    if (isWin) {
        await runExternal('上传分支与标记', ['cmd.exe', '/c', chain])
    } else {
        await runExternal('上传分支与标记', ['bash', '-lc', chain])
    }
}

async function doFullShip(d) {
    await explainThen(`一键发布 ${d.next}`, [
        `将把版本从 ${d.version} 升到 ${c.bold}${d.next}${c.reset}。`,
        '自动完成：改版本号 → 本地存档 → 上传并通知云端打包。',
        '前提：功能代码已经全部存档（首页显示「没有未存档的修改」）。',
        d.weekday ? '工作日会要求输入 FORCE。' : '按提示输入 Y 即可。',
    ])

    let noVerify = false
    if (d.weekday) {
        if (!(await confirmForce())) {
            console.log('已取消。')
            await pause()
            return
        }
        noVerify = true
    } else if (!(await confirmYes(`确认发布 v${d.next}？`))) {
        console.log('已取消。')
        await pause()
        return
    }

    const args = [SHIP, '--bump', bump, '--yes']
    if (noVerify) args.push('--no-verify')
    await runExternal(`一键发布 v${d.next}`, [process.execPath, ...args])
}

async function doPushCnbCode() {
    await explainThen('把代码推到 CNB（空仓必做）', [
        'CNB 上如果还没有分支/提交，就无法创建 Release，镜像安装包一定会失败。',
        '这一步会把 GitHub 的 main（或你指定的分支）推到 https://cnb.cool/gouyehappy/datawise-pro',
        '需要环境变量 CNB_TOKEN。用户名固定是 cnb，密码=令牌（脚本会写进临时 remote）。',
        '工作日会自动加 --no-verify，绕过本机「仅周末可 push」的限制。',
    ])
    if (!process.env.CNB_TOKEN) {
        console.log(`${c.yellow}未检测到 CNB_TOKEN。${c.reset}`)
        const tok = await ask('请粘贴 CNB 令牌后回车（不会写入磁盘，仅当前窗口）: ')
        if (!tok) {
            console.log('已取消。')
            await pause()
            return
        }
        process.env.CNB_TOKEN = tok
    }
    if (!(await confirmYes('确认把 main 分支推到 CNB？'))) {
        console.log('已取消。')
        await pause()
        return
    }
    if (!existsSync(PUSH_CNB)) {
        console.log(`${c.red}找不到 push-code-to-cnb.mjs${c.reset}`)
        await pause()
        return
    }
    process.env.CNB_TARGET_COMMITISH = process.env.CNB_TARGET_COMMITISH || 'main'
    await runExternal('推代码到 CNB', [process.execPath, PUSH_CNB, '--branch', 'main', '--tags', '--yes'])
}

async function doCnb(d) {
    await explainThen('同步安装包到国内镜像 (CNB)', [
        '把 GitHub 上已经打好的安装包，再拷一份到国内 CNB，下载更稳。',
        '需要本机已设置环境变量 CNB_TOKEN（令牌）。没有的话先找开发同事配置。',
        '请确认 GitHub Release 里已经能看到安装包，再同步。',
        '若 CNB 还是空仓：请先按首页【4】把代码推上去，再回来做这一步。',
    ])
    if (!process.env.CNB_TOKEN) {
        console.log(`${c.yellow}当前检测不到 CNB_TOKEN。${c.reset}`)
        console.log('可在命令行先执行：  set CNB_TOKEN=你的令牌')
        console.log('然后再回来做这一步。\n')
    }
    const defaultTag = d.tagName || `v${d.version}`
    let tag = await ask(`要同步哪个版本标记？（直接回车 = ${defaultTag}）: `)
    if (!tag) tag = defaultTag
    if (!(await confirmYes(`确认同步 ${tag} 到 CNB？`))) {
        console.log('已取消。')
        await pause()
        return
    }
    if (!existsSync(MIRROR)) {
        console.log(`${c.red}找不到同步脚本，请联系开发。${c.reset}`)
        await pause()
        return
    }
    await runExternal(`同步 CNB ${tag}`, [process.execPath, MIRROR, '--tag', tag])
}

async function runRecommended(d) {
    switch (d.advice.id) {
        case 'commit-features': {
            clear()
            console.log(`\n${c.bgYellow}${c.bold}  需要先存档  ${c.reset}\n`)
            console.log('  下面这些文件还没存进版本库（本助手不会自动替你存功能代码）：\n')
            for (const f of d.otherDirty.slice(0, 25)) console.log(`  · ${f}`)
            if (d.otherDirty.length > 25) console.log(`  … 一共 ${d.otherDirty.length} 个`)
            console.log(`\n  ${c.bold}请让开发同事用 Cursor 提交（Commit）这些改动。${c.reset}`)
            console.log('  完成后回到本窗口，按 0 刷新。')
            await pause()
            break
        }
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
            await showGuide()
    }
}

function printMore() {
    clear()
    console.log(`\n${c.bold}全部功能（一个 bat 管全项目）${c.reset}\n`)
    console.log(`  ${c.dim}对应 npm run / scripts/dw.mjs / 发版脚本，选菜单即可${c.reset}\n`)
    console.log(`  ${c.cyan}1${c.reset}  开发联调          ${c.dim}dev / stop / 标准版联调${c.reset}`)
    console.log(`  ${c.cyan}2${c.reset}  编译打包          ${c.dim}前后端 / 安装包 / 一键全量${c.reset}`)
    console.log(`  ${c.cyan}3${c.reset}  Git 与上传        ${c.dim}GitHub / CNB 推代码${c.reset}`)
    console.log(`  ${c.cyan}4${c.reset}  手动发版步骤      ${c.dim}bump / tag / CNB 镜像${c.reset}`)
    console.log(`  ${c.cyan}5${c.reset}  质量检查          ${c.dim}typecheck / 门禁 / 对齐${c.reset}`)
    console.log(`  ${c.cyan}6${c.reset}  插件与其它        ${c.dim}社区插件 / 官网 / mock${c.reset}`)
    console.log(`  ${c.cyan}7${c.reset}  命令对照表        ${c.dim}菜单 ↔ npm 脚本${c.reset}`)
    console.log(`\n  ${c.cyan}M${c.reset}  回首页\n`)
    output.write('  请按键 ')
}

function printDev() {
    clear()
    console.log(`\n${c.bold}开发联调${c.reset}  ${c.dim}命令在新窗口执行 · npm run dev / stop …${c.reset}\n`)
    console.log(`  ${c.cyan}D${c.reset}  启动开发模式（全量）     ${c.dim}npm run dev${c.reset}`)
    console.log(`  ${c.cyan}T${c.reset}  启动开发模式（标准版）   ${c.dim}npm run dev:standard${c.reset}`)
    console.log(`  ${c.cyan}V${c.reset}  仅前端 Vite               ${c.dim}npm run dev:frontend${c.reset}`)
    console.log(`  ${c.cyan}S${c.reset}  停止开发模式             ${c.dim}npm run stop / 双击 stop.bat（推荐）${c.reset}`)
    console.log(`\n  ${c.yellow}注意：Vite 在后台独立跑，dev 窗口里 Ctrl+C 往往关不干净 —— 请按 S 或 stop.bat。${c.reset}`)
    console.log(`\n  ${c.cyan}M${c.reset}  返回\n`)
    output.write('  请按键 ')
}

function printBuild() {
    clear()
    console.log(`\n${c.bold}编译打包${c.reset}  ${c.dim}命令在新窗口执行 · npm run frontend / dist …${c.reset}\n`)
    console.log(`  ${c.cyan}F${c.reset}  编译前端（全量）         ${c.dim}npm run frontend${c.reset}`)
    console.log(`  ${c.cyan}G${c.reset}  编译前端（标准版）       ${c.dim}npm run frontend:standard${c.reset}`)
    console.log(`  ${c.cyan}K${c.reset}  编译后端（全量）         ${c.dim}npm run backend${c.reset}`)
    console.log(`  ${c.cyan}J${c.reset}  编译后端（标准版胖包）   ${c.dim}npm run backend:standard${c.reset}`)
    console.log(`  ${c.cyan}P${c.reset}  编译连接器插件           ${c.dim}npm run plugins${c.reset}`)
    console.log(`  ${c.cyan}L${c.reset}  打桌面安装包（core）     ${c.dim}npm run dist${c.reset}`)
    console.log(`  ${c.cyan}1${c.reset}  打桌面瘦包               ${c.dim}npm run dist:slim${c.reset}`)
    console.log(`  ${c.cyan}2${c.reset}  打桌面全量包             ${c.dim}npm run dist:full${c.reset}`)
    console.log(`  ${c.cyan}3${c.reset}  本机打包并上传 GitHub    ${c.dim}npm run dist:publish（需 GH_TOKEN）${c.reset}`)
    console.log(`  ${c.cyan}A${c.reset}  一键：清理+后端+插件+前端+安装包  ${c.dim}npm run all${c.reset}`)
    console.log(`  ${c.cyan}C${c.reset}  清理构建产物             ${c.dim}npm run clean${c.reset}`)
    console.log(`\n  ${c.dim}安装包较慢，需在对应操作系统本机执行；正式发版更推荐打 tag 走 CI。${c.reset}`)
    console.log(`\n  ${c.cyan}M${c.reset}  返回\n`)
    output.write('  请按键 ')
}

function printUpload() {
    const d = diagnose()
    clear()
    console.log(`\n${c.bold}手动上传${c.reset}\n`)
    console.log(`  当前分支：${d.branch}`)
    console.log(`  当前版本：${d.version}\n`)
    console.log(`  ${c.cyan}1${c.reset}  普通上传代码到 GitHub`)
    console.log(`  ${c.cyan}2${c.reset}  紧急上传代码到 GitHub（工作日，需 FORCE）`)
    console.log(`  ${c.cyan}3${c.reset}  上传发版标记 ${d.tagName || ''}`)
    console.log(`  ${c.cyan}4${c.reset}  紧急上传发版标记（需 FORCE）`)
    console.log(`  ${c.cyan}5${c.reset}  把代码推到 CNB（空仓必做）`)
    console.log(`  ${c.cyan}6${c.reset}  看看本地有哪些改动`)
    console.log(`  ${c.cyan}7${c.reset}  看看最近几次存档记录`)
    console.log(`\n  ${c.cyan}M${c.reset}  返回\n`)
    output.write('  请按键 ')
}

function printManual() {
    const d = diagnose()
    clear()
    console.log(`\n${c.bold}手动发版（进阶）${c.reset}\n`)
    console.log(`  当前 ${d.version}，若升一版会变成 ${d.next}\n`)
    console.log(`  ${c.cyan}1${c.reset}  只看状态`)
    console.log(`  ${c.cyan}2${c.reset}  只改版本号（不存档）`)
    console.log(`  ${c.cyan}3${c.reset}  只存档版本号`)
    console.log(`  ${c.cyan}4${c.reset}  上传并打标记`)
    console.log(`  ${c.cyan}5${c.reset}  同步 CNB`)
    console.log(`  ${c.cyan}A${c.reset}  一键做完`)
    console.log(`  ${c.cyan}B${c.reset}  改「升哪个版本」（patch/minor/major）`)
    console.log(`\n  ${c.cyan}M${c.reset}  返回\n`)
    output.write('  请按键 ')
}

function printTools() {
    // legacy alias → quality
    printQuality()
}

function printQuality() {
    clear()
    console.log(`\n${c.bold}质量检查${c.reset}\n`)
    console.log(`  ${c.cyan}1${c.reset}  各处版本号是否一致       ${c.dim}check:version-alignment${c.reset}`)
    console.log(`  ${c.cyan}2${c.reset}  发版状态摘要             ${c.dim}ship:status${c.reset}`)
    console.log(`  ${c.cyan}3${c.reset}  前端类型检查             ${c.dim}typecheck:frontend${c.reset}`)
    console.log(`  ${c.cyan}4${c.reset}  全量类型检查             ${c.dim}typecheck${c.reset}`)
    console.log(`  ${c.cyan}5${c.reset}  提交前门禁检查           ${c.dim}pre-commit-check${c.reset}`)
    console.log(`  ${c.cyan}6${c.reset}  packages 边界审计        ${c.dim}audit:packages-boundary${c.reset}`)
    console.log(`  ${c.cyan}7${c.reset}  连接能力矩阵检查         ${c.dim}check:connection-capabilities${c.reset}`)
    console.log(`  ${c.cyan}8${c.reset}  列出 dw 常用命令         ${c.dim}npm run help${c.reset}`)
    console.log(`  ${c.cyan}H${c.reset}  说明书`)
    console.log(`\n  ${c.cyan}M${c.reset}  返回\n`)
    output.write('  请按键 ')
}

function printPlugins() {
    clear()
    console.log(`\n${c.bold}插件与其它${c.reset}\n`)
    console.log(`  ${c.cyan}1${c.reset}  社区插件 CLI 帮助        ${c.dim}npm run plugin${c.reset}`)
    console.log(`  ${c.cyan}2${c.reset}  社区插件冒烟测试         ${c.dim}smoke:community-plugin${c.reset}`)
    console.log(`  ${c.cyan}3${c.reset}  清理过期插件暂存目录     ${c.dim}clean:dwp-staging${c.reset}`)
    console.log(`  ${c.cyan}4${c.reset}  模拟连接器市场           ${c.dim}mock:connector-market${c.reset}`)
    console.log(`  ${c.cyan}5${c.reset}  启动官网本地预览         ${c.dim}npm run website${c.reset}`)
    console.log(`  ${c.cyan}6${c.reset}  构建官网                 ${c.dim}npm run website:build${c.reset}`)
    console.log(`  ${c.cyan}7${c.reset}  导出 OpenAPI             ${c.dim}export:openapi（需后端已启动）${c.reset}`)
    console.log(`\n  ${c.cyan}M${c.reset}  返回\n`)
    output.write('  请按键 ')
}

async function showCommandMap() {
    clear()
    console.log(`
${c.bold}菜单 ↔ npm 命令对照（常用）${c.reset}

  首页推荐 / 发版
    升版本发版流………… ship:release / ship:menu 首页回车
    推代码到 CNB………… npm run cnb:push-code
    镜像安装包…………… npm run mirror:cnb

  开发联调
    D 全量联调…………… npm run dev
    T 标准版联调……… npm run dev:standard
    S 停止……………… npm run stop
    V 仅前端…………… npm run dev:frontend

  编译打包
    F/G 前端…………… npm run frontend[:standard]
    K/J 后端…………… npm run backend[:standard]
    P 插件……………… npm run plugins
    L/1/2 安装包……… npm run dist[:slim|:full]
    A 一键全量………… npm run all
    C 清理……………… npm run clean

  质量
    typecheck / pre-commit-check / check:version-alignment …

  未收进菜单（少用/CI）
    scripts/pack/*.sh、各类 audit 细扫、截图采集等
    需要时仍可在仓库根目录 npm run / node scripts/…
`)
    await pause()
}

async function runDw(cmd) {
    const isDevStart = cmd === 'dev' || cmd === 'dev:standard'
    await runExternal(`dw ${cmd}`, [process.execPath, DW, cmd], {
        hint: isDevStart
            ? '关闭联调：回本菜单按 S，或双击 stop.bat（勿用 ops-close，那只关操作台）。'
            : undefined,
    })
}

async function runNpmScript(script, extraArgs = []) {
    const args = [isWin ? 'npm.cmd' : 'npm', 'run', script]
    if (extraArgs.length) args.push('--', ...extraArgs)
    await runExternal(`npm run ${script}`, args)
}

async function gitPushBranch(noVerify) {
    clear()
    const branch = git(['branch', '--show-current']) || 'HEAD'
    console.log(`\n上传当前分支「${branch}」${noVerify ? '（紧急）' : ''}\n`)
    if (noVerify) {
        if (!(await confirmForce())) {
            await pause()
            return
        }
    } else if (!(await confirmYes('确认上传？'))) {
        await pause()
        return
    }
    const args = noVerify
        ? ['git', 'push', '--no-verify', 'origin', `HEAD:refs/heads/${branch}`]
        : ['git', 'push', 'origin', `HEAD:refs/heads/${branch}`]
    await runExternal(`上传分支 ${branch}`, args)
}

async function changeBump() {
    clear()
    console.log(`
当前规则：${bump}
  patch  = 修 bug，最后一位 +1（推荐）
  minor  = 新功能，中间位 +1
  major  = 大改，第一位 +1
  也可以直接输入具体号，如 5.0.2
`)
    const nb = await ask('请输入新规则: ')
    if (nb) bump = nb
    console.log(`已设为 ${bump} → 下一版将是 ${nextBumpVersion(readVersion(), bump)}`)
    await pause()
}

async function handleHome(key, d) {
    const shipKeysOk = d.advice.id === 'cnb-or-next' || d.advice.id === 'ready-bump'
    if (key === 'enter' || key === '1') await runRecommended(d)
    else if (key === '2') {
        // 仅在首页显示【2】时允许，避免误触一键发版
        if (!shipKeysOk) {
            clear()
            console.log(`\n${c.yellow}当前阶段还不适合按【2】发下一版。${c.reset}`)
            console.log('请先按回车按绿色推荐去做，或到「更多 → 手动发版」。')
            await pause()
            return
        }
        await doFullShip(d)
    } else if (key === '3') {
        if (!shipKeysOk) {
            clear()
            console.log(`\n${c.yellow}当前阶段请先完成推荐步骤，再同步 CNB。${c.reset}`)
            console.log('需要的话可按【4】先推代码到 CNB，或到「更多 → 手动发版」。')
            await pause()
            return
        }
        await doCnb(d)
    } else if (key === '4') await doPushCnbCode()
    else if (key === 'h') await showGuide()
    else if (key === 'm') page = 'more'
    else if (key === '0') return
}

async function handleMore(key) {
    if (key === '1') page = 'dev'
    else if (key === '2') page = 'build'
    else if (key === '3') page = 'upload'
    else if (key === '4') page = 'manual'
    else if (key === '5') page = 'quality'
    else if (key === '6') page = 'plugins'
    else if (key === '7') await showCommandMap()
    else if (key === 'm' || key === 'enter') page = 'home'
}

async function handleDev(key) {
    if (key === 'm' || key === 'enter') page = 'more'
    else if (key === 'd') await runDw('dev')
    else if (key === 't') await runDw('dev:standard')
    else if (key === 's') {
        // 本窗口直接跑 stop 脚本：无 npm 套娃、无 DEP0190 刷屏
        await runInline('停止开发模式', [process.execPath, join(ROOT, 'scripts', 'dev-stop.mjs')])
    } else if (key === 'v') {
        await runExternal('仅前端 Vite', [isWin ? 'npm.cmd' : 'npm', 'run', 'dev:frontend'], {
            hint: '关闭请回本菜单按 S（或双击 stop.bat）。Vite 是后台进程，新窗口 Ctrl+C 通常无效。',
        })
    }
}

async function handleBuild(key) {
    if (key === 'm' || key === 'enter') page = 'more'
    else if (key === 'f') await runDw('frontend')
    else if (key === 'g') await runDw('frontend:standard')
    else if (key === 'k') await runDw('backend')
    else if (key === 'j') await runDw('backend:standard')
    else if (key === 'p') await runDw('plugins')
    else if (key === 'l') await runDw('dist')
    else if (key === '1') await runDw('dist:slim')
    else if (key === '2') await runDw('dist:full')
    else if (key === '3') {
        if (!(await confirmYes('将本机打包并上传 GitHub（需 GH_TOKEN）。确认？'))) {
            await pause()
            return
        }
        await runDw('dist:publish')
    } else if (key === 'a') {
        if (!(await confirmYes('将清理并完整编译打包，可能很久。确认？'))) {
            await pause()
            return
        }
        await runDw('all')
    } else if (key === 'c') await runDw('clean')
}

async function handleUpload(key) {
    const d = diagnose()
    if (key === 'm' || key === 'enter') page = 'more'
    else if (key === '1') await gitPushBranch(false)
    else if (key === '2') await gitPushBranch(true)
    else if (key === '3') await doPushTag(d, {createTag: !d.localTag})
    else if (key === '4') {
        d.weekday = true
        await doPushTag(d, {createTag: !d.localTag})
    } else if (key === '5') await doPushCnbCode()
    else if (key === '6') await runInline('git status', ['git', 'status'])
    else if (key === '7') await runInline('git log', ['git', 'log', '-8', '--oneline', '--decorate'])
}

async function handleManual(key) {
    const d = diagnose()
    if (key === 'm' || key === 'enter') page = 'more'
    else if (key === '1') await runInline('发版状态', [process.execPath, SHIP, '--step', 'status'])
    else if (key === '2') await runExternal('只改版本号', [process.execPath, SHIP, '--bump', bump, '--step', 'bump'])
    else if (key === '3') await doCommitVersion(d)
    else if (key === '4') await doPushTag(d, {createTag: true})
    else if (key === '5') await doCnb(d)
    else if (key === 'a') await doFullShip(d)
    else if (key === 'b') await changeBump()
}

async function handleTools(key) {
    await handleQuality(key)
}

async function handleQuality(key) {
    if (key === 'm' || key === 'enter') page = 'more'
    else if (key === '1') await runNpmScript('check:version-alignment')
    else if (key === '2') await runInline('发版状态', [process.execPath, SHIP, '--step', 'status'])
    else if (key === '3') await runNpmScript('typecheck:frontend')
    else if (key === '4') await runNpmScript('typecheck')
    else if (key === '5') {
        await runInline('提交前门禁', [process.execPath, join(ROOT, 'scripts', 'pre-commit-check.mjs')])
    } else if (key === '6') await runNpmScript('audit:packages-boundary')
    else if (key === '7') await runNpmScript('check:connection-capabilities')
    else if (key === '8') await runDw('help')
    else if (key === 'h') await showGuide()
}

async function handlePlugins(key) {
    if (key === 'm' || key === 'enter') page = 'more'
    else if (key === '1') await runNpmScript('plugin')
    else if (key === '2') await runDw('smoke:community-plugin')
    else if (key === '3') await runNpmScript('clean:dwp-staging')
    else if (key === '4') await runNpmScript('mock:connector-market')
    else if (key === '5') await runNpmScript('website')
    else if (key === '6') await runNpmScript('website:build')
    else if (key === '7') await runNpmScript('export:openapi')
}

async function main() {
    // Windows cmd 默认可能是 GBK：先切 UTF-8，中文菜单才不易乱码
    if (process.platform === 'win32') {
        try {
            spawnSync('cmd', ['/c', 'chcp 65001 >nul'], {stdio: 'ignore', windowsHide: true})
        } catch {
            // ignore
        }
    }

    // 缺 Node 时 bat 会先挂；这里再兜一层
    if (!existsSync(SHIP)) {
        console.error('找不到发版脚本，请确认在正确的 DataWise 仓库里双击 ops.bat。')
        process.exitCode = 1
        return
    }

    if (!isInteractiveTerminal()) {
        console.error('')
        console.error('当前窗口无法交互（没有可用键盘输入）。')
        console.error('请直接双击仓库里的 ops.bat，或在 Cursor/命令行运行： npm run ops')
        console.error('')
        process.exitCode = 1
        return
    }

    for (;;) {
        try {
            const d = diagnose()
            if (page === 'home') printHome(d)
            else if (page === 'more') printMore()
            else if (page === 'dev') printDev()
            else if (page === 'build') printBuild()
            else if (page === 'upload') printUpload()
            else if (page === 'manual') printManual()
            else if (page === 'tools' || page === 'quality') printQuality()
            else if (page === 'plugins') printPlugins()

            const key = (await readKey()).toLowerCase()
            output.write('\n')
            if (key === 'q' || key === '\u001b') {
                clear()
                console.log('\n正在退出并关闭 Ops 相关进程…')
                try {
                    // 清网页版端口 / 其它 ops 窗口；不杀当前菜单（随后自行结束）
                    closeOps({quiet: true, skipPids: [process.pid]})
                } catch {
                    // ignore
                }
                console.log('已退出。窗口即将关闭；下次双击 ops.bat 即可再打开。\n')
                // 正常退出码 0 → ops.bat 不再 pause，窗口直接关
                process.exitCode = 0
                break
            }
            if (page === 'home') await handleHome(key, d)
            else if (page === 'more') await handleMore(key)
            else if (page === 'dev') await handleDev(key)
            else if (page === 'build') await handleBuild(key)
            else if (page === 'upload') await handleUpload(key)
            else if (page === 'manual') await handleManual(key)
            else if (page === 'tools' || page === 'quality') await handleQuality(key)
            else if (page === 'plugins') await handlePlugins(key)
        } catch (e) {
            console.error('\n本轮操作出错：', e?.message || e)
            console.error('菜单会继续；需要退出请按 Q。\n')
            try {
                input.resume()
            } catch {
                // ignore
            }
            await pause('按回车继续…')
        }
    }
}

main().catch((e) => {
    console.error('\n出错了：', e.message || e)
    console.error('请把这段文字截图发给开发同事。\n')
    process.exitCode = 1
})
