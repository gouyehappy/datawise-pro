#!/usr/bin/env node
/**
 * Interactive ship-release menu (Windows-friendly).
 * Launch: scripts\desktop\ship-release.bat
 */
import {spawnSync} from 'node:child_process'
import {existsSync, readFileSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {stdin as input, stdout as output} from 'node:process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SHIP = join(ROOT, 'scripts', 'desktop', 'ship-release.mjs')

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
}

let bump = process.argv[2] || 'patch'

function runNode(args, {inherit = true} = {}) {
    const r = spawnSync(process.execPath, args, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: inherit ? 'inherit' : 'pipe',
        windowsHide: true,
    })
    return r.status ?? 1
}

function git(args) {
    const r = spawnSync('git', args, {cwd: ROOT, encoding: 'utf8', windowsHide: true})
    if (r.status !== 0) return ''
    return (r.stdout || '').trim()
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

function resolveNextBump() {
    if (/^\d+\.\d+\.\d+$/.test(bump) || /^v\d+\.\d+\.\d+$/.test(bump)) {
        return String(bump).replace(/^v/, '')
    }
    const cur = readVersion()
    const m = cur.match(/^(\d+)\.(\d+)\.(\d+)$/)
    if (!m) return '?'
    if (bump === 'minor') return `${m[1]}.${Number(m[2]) + 1}.0`
    if (bump === 'major') return `${Number(m[1]) + 1}.0.0`
    return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
}

/** Steps 3/4 tag the version already in the tree; 2/A compute next. */
function resolveTarget(forStep) {
    if (forStep === 'commit' || forStep === 'tag') {
        if (/^\d+\.\d+\.\d+$/.test(bump) || /^v\d+\.\d+\.\d+$/.test(bump)) {
            return String(bump).replace(/^v/, '')
        }
        return readVersion()
    }
    return resolveNextBump()
}

function pause(msg = '按回车返回菜单…') {
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

function line(ch = '─', n = 56) {
    return ch.repeat(n)
}

function printMenu() {
    const ver = readVersion()
    const next = resolveNextBump()
    const branch = git(['branch', '--show-current']) || '?'
    const dirty = git(['status', '--porcelain'])
    const clean = !dirty
    const tag = git(['describe', '--tags', '--abbrev=0']) || '(none)'

    clear()
    console.log()
    console.log(`${c.bg}${c.white}${c.bold}  DataWise 发版助手  ${c.reset}`)
    console.log(`${c.dim}${line()}${c.reset}`)
    console.log(`  当前版本   ${c.cyan}${c.bold}${ver}${c.reset}   ${c.dim}(按 3/4 打 tag 用这个)${c.reset}`)
    console.log(`  若再 bump  ${c.green}${next}${c.reset}   ${c.dim}(bump=${bump}，仅步骤 2 / A)${c.reset}`)
    console.log(`  最近 tag   ${c.dim}${tag}${c.reset}`)
    console.log(`  分支       ${branch}`)
    console.log(
        `  工作区     ${clean ? `${c.green}干净 ✓${c.reset}` : `${c.yellow}有未提交改动 ✗${c.reset}`}`,
    )
    if (!clean) {
        const n = dirty.split('\n').filter(Boolean).length
        console.log(`  ${c.dim}          ${n} 个文件待处理${c.reset}`)
    }
    console.log(`${c.dim}${line()}${c.reset}`)
    console.log()
    console.log(`  ${c.bold}按顺序执行${c.reset}`)
    console.log(`  ${c.cyan}1${c.reset}  检查工作区`)
    console.log(`  ${c.cyan}2${c.reset}  提升版本号          ${c.dim}→ ${next}${c.reset}`)
    console.log(`  ${c.cyan}3${c.reset}  提交版本号          ${c.dim}chore(release) ${ver}${c.reset}`)
    console.log(`  ${c.cyan}4${c.reset}  push + 打 tag       ${c.dim}v${ver} → CI${c.reset}`)
    console.log(`  ${c.cyan}5${c.reset}  镜像到 CNB          ${c.dim}等 Release 产物齐${c.reset}`)
    console.log()
    console.log(`  ${c.bold}快捷${c.reset}`)
    console.log(`  ${c.cyan}A${c.reset}  一键 2+3+4          ${c.dim}工作区须干净 → ${next}${c.reset}`)
    console.log(`  ${c.cyan}B${c.reset}  改 bump             ${c.dim}patch / minor / major / 5.0.1${c.reset}`)
    console.log(`  ${c.cyan}0${c.reset}  刷新状态`)
    console.log(`  ${c.cyan}Q${c.reset}  退出`)
    console.log()
    console.log(`${c.dim}${line()}${c.reset}`)
    output.write(`  ${c.bold}请按键${c.reset} ${c.dim}(无需回车)${c.reset} `)
}

async function readKey() {
    return new Promise((resolve) => {
        if (!input.isTTY) {
            const rl = createInterface({input, output})
            rl.question('', (ans) => {
                rl.close()
                resolve((ans || '').trim().slice(0, 1))
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
            // first printable / letter
            const ch = s.replace(/\r|\n/g, '').slice(0, 1)
            resolve(ch)
        })
    })
}

async function step1() {
    clear()
    console.log(`\n${c.bold}[1] 检查工作区${c.reset}\n`)
    runNode([SHIP, '--step', 'status'])
    const dirty = git(['status', '--porcelain'])
    console.log()
    if (dirty) {
        console.log(`${c.yellow}还有未提交改动。请先在 IDE/git 提交功能代码，再做第 2 步。${c.reset}`)
    } else {
        console.log(`${c.green}工作区干净，可以继续第 2 步。${c.reset}`)
    }
    await pause()
}

async function step2() {
    clear()
    const target = resolveTarget('bump')
    console.log(`\n${c.bold}[2] 提升版本号${c.reset}  bump=${bump} → ${target}\n`)
    const code = runNode([SHIP, '--bump', bump, '--step', 'bump'])
    console.log(code === 0 ? `\n${c.green}完成。下一步按 3。${c.reset}` : `\n${c.red}失败。${c.reset}`)
    await pause()
}

async function step3() {
    clear()
    const ver = resolveTarget('commit')
    console.log(`\n${c.bold}[3] 提交版本号${c.reset}  ${ver}\n`)
    const code = runNode([SHIP, '--bump', bump, '--step', 'commit'])
    console.log(code === 0 ? `\n${c.green}完成。下一步按 4。${c.reset}` : `\n${c.red}失败（是否已执行第 2 步？）。${c.reset}`)
    await pause()
}

async function step4() {
    clear()
    const target = resolveTarget('tag')
    console.log(`\n${c.bold}[4] push + tag v${target}${c.reset}\n`)
    console.log('将 push 当前分支并推送 annotated tag，触发 GitHub Actions 打包。\n')
    const yn = await ask(`输入 ${c.green}Y${c.reset} 确认，其它取消: `)
    if (yn.toLowerCase() !== 'y') {
        console.log('已取消。')
        await pause()
        return
    }
    const code = runNode([SHIP, '--bump', bump, '--step', 'tag', '--yes'])
    console.log(
        code === 0
            ? `\n${c.green}完成。等 Actions 打好包后再按 5。${c.reset}`
            : `\n${c.red}失败。${c.reset}`,
    )
    await pause()
}

async function step5() {
    clear()
    console.log(`\n${c.bold}[5] 镜像到 CNB${c.reset}\n`)
    if (!process.env.CNB_TOKEN) {
        console.log(`${c.yellow}未检测到环境变量 CNB_TOKEN。${c.reset}`)
        console.log('请先设置后再试，例如：')
        console.log('  set CNB_TOKEN=你的令牌\n')
    }
    let tag = await ask(`输入 tag（直接回车 = v${resolveTarget('tag')}）: `)
    if (!tag) tag = `v${resolveTarget('tag')}`
    console.log(`\n将执行: npm run mirror:cnb -- --tag ${tag}\n`)
    const yn = await ask(`输入 ${c.green}Y${c.reset} 确认: `)
    if (yn.toLowerCase() !== 'y') {
        console.log('已取消。')
        await pause()
        return
    }
    const mirror = join(ROOT, 'scripts', 'desktop', 'mirror-to-cnb.mjs')
    if (!existsSync(mirror)) {
        console.log(`${c.red}找不到 mirror-to-cnb.mjs${c.reset}`)
        await pause()
        return
    }
    const code = runNode([mirror, '--tag', tag])
    console.log(code === 0 ? `\n${c.green}完成。${c.reset}` : `\n${c.red}失败。检查 CNB_TOKEN 与 Release 产物。${c.reset}`)
    await pause()
}

async function stepAll() {
    clear()
    const target = resolveTarget('bump')
    console.log(`\n${c.bold}[A] 一键 bump + commit + tag${c.reset}\n`)
    console.log(`bump=${bump} → ${target}`)
    console.log('要求：工作区干净（功能改动已提交）。\n')
    const yn = await ask(`输入 ${c.green}Y${c.reset} 确认: `)
    if (yn.toLowerCase() !== 'y') {
        console.log('已取消。')
        await pause()
        return
    }
    const code = runNode([SHIP, '--bump', bump, '--yes'])
    console.log(
        code === 0
            ? `\n${c.green}tag 已推送。CI 产物齐后按 5 做 CNB。${c.reset}`
            : `\n${c.red}失败。${c.reset}`,
    )
    await pause()
}

async function changeBump() {
    clear()
    console.log(`\n${c.bold}改 bump${c.reset}\n`)
    console.log(`当前: ${bump}`)
    console.log('可输入: patch / minor / major / 或具体版本如 5.0.1\n')
    const nb = await ask('新的 bump: ')
    if (nb) bump = nb
    console.log(`已设为: ${bump} → 若 bump 则 ${resolveNextBump()}；打 tag 用当前 ${readVersion()}`)
    await pause('按回车…')
}

async function main() {
    // Enable ANSI on Windows 10+
    if (process.platform === 'win32') {
        try {
            spawnSync('cmd', ['/c', ''], {stdio: 'ignore', windowsHide: true})
        } catch {
            // ignore
        }
    }

    for (;;) {
        printMenu()
        const key = (await readKey()).toLowerCase()
        output.write('\n')
        if (key === 'q' || key === '\u001b') {
            clear()
            console.log('\n已退出。\n')
            break
        }
        if (key === '0') continue
        if (key === '1') await step1()
        else if (key === '2') await step2()
        else if (key === '3') await step3()
        else if (key === '4') await step4()
        else if (key === '5') await step5()
        else if (key === 'a') await stepAll()
        else if (key === 'b') await changeBump()
        else {
            // ignore unknown; flash briefly
            await new Promise((r) => setTimeout(r, 80))
        }
    }
}

main().catch((e) => {
    console.error(e.message || e)
    process.exitCode = 1
})
