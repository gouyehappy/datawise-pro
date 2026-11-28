#!/usr/bin/env node
/**
 * Push GitHub/local branches (+ optional tags) into empty/outdated CNB git repo.
 *
 * CNB Release 镜像要求仓库里已有分支/提交；空仓会 400 invalid commit revision。
 *
 * Usage:
 *   $env:CNB_TOKEN = "令牌"
 *   npm run cnb:push-code
 *   npm run cnb:push-code -- --branch main --tags
 *   npm run cnb:push-code -- --mirror
 */
import {spawnSync} from 'node:child_process'
import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DEFAULT_CNB = 'gouyehappy/datawise-pro'
const CNB_HOST = 'cnb.cool'

function parseArgs(argv) {
    const out = {
        token: process.env.CNB_TOKEN || '',
        cnbRepo: process.env.CNB_REPOSITORY || DEFAULT_CNB,
        branch: process.env.CNB_PUSH_BRANCH || 'main',
        source: '',
        tags: false,
        mirror: false,
        noVerify: true,
        dryRun: false,
        yes: false,
    }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--token') out.token = argv[++i]
        else if (a === '--cnb') out.cnbRepo = argv[++i]
        else if (a === '--branch') out.branch = argv[++i]
        else if (a === '--source') out.source = argv[++i]
        else if (a === '--tags') out.tags = true
        else if (a === '--mirror') out.mirror = true
        else if (a === '--verify') out.noVerify = false
        else if (a === '--dry-run') out.dryRun = true
        else if (a === '--yes' || a === '-y') out.yes = true
        else if (a === '--help' || a === '-h') {
            printHelp()
            process.exit(0)
        } else throw new Error(`unknown arg: ${a}`)
    }
    return out
}

function printHelp() {
    console.log(`
把代码推到 CNB（解决空仓无法创建 Release）

  npm run cnb:push-code
  npm run cnb:push-code -- --branch main --tags --yes

环境变量:
  CNB_TOKEN         必填（用户名固定 cnb，密码=令牌）
  CNB_REPOSITORY    默认 ${DEFAULT_CNB}

说明:
  · 远程名固定为 git remote "cnb"
  · 地址 https://${CNB_HOST}/owner/repo（令牌经 HTTP Authorization 注入，不写入 remote URL）
  · 用户名固定 cnb，密码=访问令牌（需含仓库写权限）
  · 默认 --no-verify（绕过本机工作日 push hook）
`)
}

function runGit(args, opts = {}) {
    const r = spawnSync('git', args, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: opts.inherit ? 'inherit' : 'pipe',
        windowsHide: true,
        env: opts.env || process.env,
    })
    if (opts.allowFail) return r
    if ((r.status ?? 1) !== 0) {
        const err = (r.stderr || r.stdout || '').trim()
        throw new Error(`git ${args.join(' ')} failed${err ? `\n${err}` : ''}`)
    }
    return r
}

function gitOut(args) {
    return (runGit(args).stdout || '').trim()
}

/** Plain HTTPS remote — never embed token in URL (avoids .git/config leak + pre-commit scan). */
function publicCnbUrl(cnbRepo) {
    if (!/^[^/\s]+\/[^/\s]+$/.test(cnbRepo)) {
        throw new Error(`CNB repo must be owner/repo, got ${cnbRepo}`)
    }
    return `https://${CNB_HOST}/${cnbRepo}`
}

function ensureCnbRemote(cnbRepo) {
    const url = publicCnbUrl(cnbRepo)
    const remotes = gitOut(['remote'])
    const names = remotes ? remotes.split('\n') : []
    if (names.includes('cnb')) {
        runGit(['remote', 'set-url', 'cnb', url])
        console.log('[cnb-push] 已更新 remote cnb URL')
    } else {
        runGit(['remote', 'add', 'cnb', url])
        console.log('[cnb-push] 已添加 remote cnb')
    }
    return url
}

/**
 * Push with CNB auth that survives Windows Git Credential Manager.
 * Prefer Authorization Basic header (user=cnb, pass=token) so GCM cannot
 * send an empty/stale password — that surfaces as remote "token:" blank + 仓库不存在.
 */
function withCnbAuth(token, fn) {
    const basic = Buffer.from(`cnb:${token}`, 'utf8').toString('base64')
    // Disable helpers for this process; header carries the real credential.
    const env = {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GCM_INTERACTIVE: 'never',
        GIT_CONFIG_COUNT: '2',
        GIT_CONFIG_KEY_0: 'credential.helper',
        GIT_CONFIG_VALUE_0: '',
        GIT_CONFIG_KEY_1: 'http.extraHeader',
        GIT_CONFIG_VALUE_1: `Authorization: Basic ${basic}`,
    }
    // Best-effort: drop stale cnb.cool entries from credential store
    try {
        spawnSync('git', ['credential', 'reject'], {
            input: 'protocol=https\nhost=cnb.cool\n\n',
            encoding: 'utf8',
            windowsHide: true,
            stdio: ['pipe', 'ignore', 'ignore'],
        })
        spawnSync('git', ['credential', 'reject'], {
            input: 'protocol=https\nhost=cnb.cool\nusername=cnb\n\n',
            encoding: 'utf8',
            windowsHide: true,
            stdio: ['pipe', 'ignore', 'ignore'],
        })
    } catch {
        // ignore
    }
    return fn(env)
}

function refExists(ref) {
    const r = runGit(['rev-parse', '--verify', ref], {allowFail: true})
    return (r.status ?? 1) === 0
}

function resolveSourceRef(branch, explicit) {
    if (explicit) {
        if (!refExists(explicit)) throw new Error(`找不到源引用: ${explicit}`)
        return explicit
    }
    const originRef = `origin/${branch}`
    if (refExists(originRef)) return originRef
    if (refExists(branch)) return branch
    throw new Error(
        `找不到要推送的分支 ${branch}（本地与 origin/${branch} 都不存在）。\n` +
            `可先: git fetch origin，或 --branch 改成实际分支名。`,
    )
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    console.log('')
    console.log('=== 推送代码到 CNB ===')
    console.log('')

    if (!args.token) {
        console.error('缺少 CNB_TOKEN。')
        console.error('  $env:CNB_TOKEN = "你的令牌"')
        console.error('然后: npm run cnb:push-code -- --yes')
        process.exitCode = 1
        return
    }

    console.log(`CNB 仓库 : ${args.cnbRepo}`)
    console.log(`地址     : ${publicCnbUrl(args.cnbRepo)}`)
    console.log(`分支     : ${args.branch}`)
    console.log(`模式     : ${args.mirror ? 'mirror 全量' : '单分支'}${args.tags ? ' + tags' : ''}`)
    console.log('')

    if (!args.yes && !args.dryRun) {
        console.error('为防误推，请加 --yes 确认。')
        console.error('  npm run cnb:push-code -- --yes')
        process.exitCode = 1
        return
    }

    ensureCnbRemote(args.cnbRepo)

    const pushExtra = []
    if (args.noVerify) pushExtra.push('--no-verify')

    if (args.dryRun) {
        console.log('[dry-run] skip push')
        return
    }

    console.log(`[cnb-push] 令牌长度 ${args.token.length}（不打印内容）；鉴权用户名固定 cnb`)
    withCnbAuth(args.token, (env) => {
        if (args.mirror) {
            console.log('[cnb-push] git push --mirror cnb …')
            runGit(['push', ...pushExtra, '--mirror', 'cnb'], {inherit: true, env})
            return
        }
        const source = resolveSourceRef(args.branch, args.source)
        const dest = `refs/heads/${args.branch}`
        console.log(`[cnb-push] ${source} → cnb ${args.branch}`)
        runGit(['push', ...pushExtra, 'cnb', `${source}:${dest}`], {inherit: true, env})
        if (args.tags) {
            console.log('[cnb-push] 推送 tags…')
            runGit(['push', ...pushExtra, 'cnb', '--tags'], {inherit: true, env})
        }
    })

    console.log('')
    console.log('完成。请在浏览器确认已有代码：')
    console.log(`  ${publicCnbUrl(args.cnbRepo)}`)
    console.log('')
    console.log('然后镜像 Release：')
    console.log(`  $env:CNB_TARGET_COMMITISH = "${args.branch}"`)
    console.log('  npm run mirror:cnb -- --tag vX.Y.Z')
    console.log('')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((e) => {
        console.error('')
        console.error('失败:', e.message || e)
        console.error('')
        console.error('若仍提示「仓库不存在」且 remote: token: 为空/鉴权失败：')
        console.error('  1) 个人设置 → 访问令牌：勾选该仓库的「写/推送」权限后换新令牌')
        console.error('  2) $env:CNB_TOKEN = "新令牌" 后再跑本命令')
        console.error('  3) 凭据管理器里删除 git:https://cnb.cool 的旧项')
        console.error('')
        process.exitCode = 1
    })
}
