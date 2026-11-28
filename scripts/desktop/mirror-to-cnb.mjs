#!/usr/bin/env node
/**
 * One-click: GitHub Release → CNB Releases (gouyehappy/datawise-pro by default).
 *
 * Prerequisites:
 *   - gh CLI logged in (gh auth status)
 *   - CNB_TOKEN env set (or pass --token)
 *
 * Foolproof usage:
 *   # PowerShell (once per shell):
 *   $env:CNB_TOKEN = "你的token"
 *   npm run mirror:cnb
 *
 *   # specific tag / full installers too:
 *   npm run mirror:cnb -- --tag v5.0.0
 *   npm run mirror:cnb -- --tag v5.0.0 --full
 */
import {spawnSync} from 'node:child_process'
import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {resolveRepoIdentity} from '../repo-identity.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DEFAULT_CNB = 'gouyehappy/datawise-pro'

/** Incremental packs first — what users download most often. */
const INCREMENTAL_PATTERNS = [
    '*frontend-dist.zip',
    '*server-jar.zip',
    'version.json',
    'version-*.json',
]

function parseArgs(argv) {
    const out = {
        tag: '',
        token: process.env.CNB_TOKEN || '',
        cnbRepo: process.env.CNB_REPOSITORY || DEFAULT_CNB,
        githubRepo: process.env.DATAWISE_GITHUB_REPO || '',
        full: false,
        makeLatest: true,
        keep: false,
    }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--tag') out.tag = argv[++i]
        else if (a === '--token') out.token = argv[++i]
        else if (a === '--cnb') out.cnbRepo = argv[++i]
        else if (a === '--github') out.githubRepo = argv[++i]
        else if (a === '--full') out.full = true
        else if (a === '--no-make-latest') out.makeLatest = false
        else if (a === '--keep') out.keep = true
        else if (a === '--help' || a === '-h') {
            printHelp()
            process.exit(0)
        } else throw new Error(`unknown argument: ${a} (try --help)`)
    }
    return out
}

function printHelp() {
    console.log(`
DataWise → CNB 一键镜像

用法:
  npm run mirror:cnb
  npm run mirror:cnb -- --tag v5.0.0
  npm run mirror:cnb -- --tag v5.0.0 --full

环境变量:
  CNB_TOKEN             必填（CNB 访问令牌）
  CNB_REPOSITORY        默认 ${DEFAULT_CNB}
  CNB_TARGET_COMMITISH  可选；CNB 上真实存在的分支名或 commit SHA
                        （勿照搬 GitHub 的 main，若 CNB 没有该分支会 400）
  DATAWISE_GITHUB_REPO  可选；不设则按下方顺序自动探测

GitHub 源仓库探测顺序:
  1) --github / DATAWISE_GITHUB_REPO
  2) git remote origin（若是 github.com）
  3) 其它 git remote 里的 github.com
  4) 回退 ${DEFAULT_CNB}（当前桌面发版仓）

选项:
  --tag TAG          默认 = GitHub 上 latest 的 tag
  --full             同步全部资产（含 Setup.exe / 大 zip）；默认只同步增量包
  --cnb owner/repo   CNB 目标仓库
  --github owner/repo
  --no-make-latest   不要把该 tag 标成 CNB latest
  --keep             保留临时下载目录
`)
}

function run(cmd, args, opts = {}) {
    const result = spawnSync(cmd, args, {
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
        ...opts,
    })
    if (result.status !== 0) {
        const err = (result.stderr || result.stdout || '').trim()
        throw new Error(`${cmd} ${args.join(' ')} failed${err ? `: ${err}` : ''}`)
    }
    return result.stdout || ''
}

function whichGh() {
    const probe = spawnSync('gh', ['--version'], {encoding: 'utf8', windowsHide: true})
    if (probe.status !== 0) {
        throw new Error('未找到 gh。请先安装 GitHub CLI: https://cli.github.com/ 并执行 gh auth login')
    }
}

function parseGithubSlugFromUrl(url) {
    const text = String(url || '').trim()
    // https://github.com/owner/repo.git  |  git@github.com:owner/repo.git
    const m = text.match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i)
    if (!m) return ''
    return `${m[1]}/${m[2]}`
}

function githubSlugFromGitRemotes() {
    const origin = spawnSync('git', ['remote', 'get-url', 'origin'], {
        cwd: ROOT,
        encoding: 'utf8',
        windowsHide: true,
    })
    if (origin.status === 0) {
        const slug = parseGithubSlugFromUrl(origin.stdout)
        if (slug) return slug
    }
    const all = spawnSync('git', ['remote', '-v'], {
        cwd: ROOT,
        encoding: 'utf8',
        windowsHide: true,
    })
    if (all.status !== 0) return ''
    for (const line of (all.stdout || '').split('\n')) {
        if (!/\(fetch\)/.test(line)) continue
        const slug = parseGithubSlugFromUrl(line)
        if (slug) return slug
    }
    return ''
}

/**
 * Mirror must read the repo that actually hosts desktop Releases.
 * Prefer local git remotes over the historical datawise-cli default.
 */
function resolveGithubSlug(explicit) {
    if (explicit && /^[^/\s]+\/[^/\s]+$/.test(explicit)) return explicit
    const fromGit = githubSlugFromGitRemotes()
    if (fromGit) return fromGit
    const id = resolveRepoIdentity({allowDefault: false})
    if (id?.slug) return id.slug
    return DEFAULT_CNB
}

/** Resolve tag (annotated or lightweight) to underlying commit SHA. */
function resolveGithubTagCommitSha(githubRepo, tag) {
    try {
        const refJson = run('gh', [
            'api',
            `repos/${githubRepo}/git/ref/tags/${encodeURIComponent(tag)}`,
        ])
        const ref = JSON.parse(refJson)
        const obj = ref?.object
        if (!obj?.sha) return ''
        if (obj.type === 'commit') return obj.sha
        if (obj.type === 'tag') {
            const tagJson = run('gh', ['api', `repos/${githubRepo}/git/tags/${obj.sha}`])
            const peeled = JSON.parse(tagJson)
            if (peeled?.object?.sha) return peeled.object.sha
        }
        return obj.sha
    } catch {
        return ''
    }
}

function assertReleaseExists(githubRepo, tag) {
    const probe = spawnSync(
        'gh',
        ['release', 'view', tag, '--repo', githubRepo, '--json', 'tagName'],
        {encoding: 'utf8', windowsHide: true},
    )
    if (probe.status === 0) return
    const err = (probe.stderr || probe.stdout || '').trim()
    const fromGit = githubSlugFromGitRemotes()
    const hints = [
        `GitHub 仓库 ${githubRepo} 上没有 Release「${tag}」（不是单纯缺 git tag）。`,
        err ? `详情: ${err}` : '',
        '',
        '请确认：',
        `  1) 浏览器打开 https://github.com/${githubRepo}/releases 是否已有 ${tag}`,
        '  2) desktop-release CI 是否已跑完并创建了 Release',
        `  3) 若 Release 在别的仓，显式指定：npm run mirror:cnb -- --tag ${tag} --github owner/repo`,
    ]
    if (fromGit && fromGit !== githubRepo) {
        hints.push(`  当前 git origin 指向 ${fromGit}，与本次使用的 ${githubRepo} 不一致`)
    }
    throw new Error(hints.filter(Boolean).join('\n'))
}

function resolveTag(githubRepo, tag) {
    if (tag) return tag.startsWith('v') ? tag : `v${tag}`
    const json = run('gh', [
        'release',
        'view',
        '--repo',
        githubRepo,
        '--json',
        'tagName',
    ])
    const parsed = JSON.parse(json)
    if (!parsed.tagName) throw new Error('无法解析 GitHub latest release tag')
    return parsed.tagName
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    console.log('')
    console.log('=== DataWise → CNB 一键镜像 ===')
    console.log('')

    if (!args.token) {
        console.error('缺少 CNB_TOKEN。')
        console.error('')
        console.error('PowerShell 先执行（本窗口有效）：')
        console.error('  $env:CNB_TOKEN = "你的CNB令牌"')
        console.error('然后：')
        console.error('  npm run mirror:cnb')
        console.error('')
        process.exitCode = 1
        return
    }

    whichGh()
    const githubRepo = resolveGithubSlug(args.githubRepo)
    const tag = resolveTag(githubRepo, args.tag)
    assertReleaseExists(githubRepo, tag)
    const work = mkdtempSync(join(tmpdir(), 'dw-cnb-'))
    const assetsDir = join(work, 'assets')
    mkdirSync(assetsDir, {recursive: true})

    console.log(`GitHub : ${githubRepo}`)
    console.log(`CNB    : ${args.cnbRepo}`)
    console.log(`Tag    : ${tag}`)
    console.log(`模式   : ${args.full ? '全部资产' : '仅增量（frontend / server-jar / version.json）'}`)
    console.log(`临时目录: ${work}`)
    console.log('')

    try {
        console.log('[1/3] 读取 GitHub Release 元数据…')
        const meta = run('gh', [
            'release',
            'view',
            tag,
            '--repo',
            githubRepo,
            '--json',
            'tagName,name,body,targetCommitish,isPrerelease',
        ])
        const releaseObj = JSON.parse(meta)
        // Peel annotated tag → commit SHA；CNB 若已同步该提交可直接用
        const commitSha = resolveGithubTagCommitSha(githubRepo, tag)
        if (commitSha) {
            releaseObj.targetCommitSha = commitSha
            console.log(`[1/3] GitHub tag ${tag} → commit ${commitSha.slice(0, 12)}…`)
        }
        const releaseJsonPath = join(work, 'release.json')
        writeFileSync(releaseJsonPath, JSON.stringify(releaseObj), 'utf8')

        console.log('[2/3] 下载资产…')
        const dlArgs = ['release', 'download', tag, '--repo', githubRepo, '--dir', assetsDir, '--clobber']
        if (!args.full) {
            for (const pattern of INCREMENTAL_PATTERNS) {
                dlArgs.push('--pattern', pattern)
            }
        }
        run('gh', dlArgs, {stdio: 'inherit'})

        const syncScript = join(ROOT, 'scripts', 'desktop', 'sync-cnb-release.mjs')
        if (!existsSync(syncScript)) throw new Error(`missing ${syncScript}`)

        console.log('[3/3] 上传到 CNB…')
        const syncArgs = [
            syncScript,
            '--github-release',
            releaseJsonPath,
            '--assets-dir',
            assetsDir,
            '--repository',
            args.cnbRepo,
        ]
        if (args.makeLatest) syncArgs.push('--make-latest')

        const sync = spawnSync(process.execPath, syncArgs, {
            stdio: 'inherit',
            env: {
                ...process.env,
                CNB_TOKEN: args.token,
                CNB_REPOSITORY: args.cnbRepo,
            },
            windowsHide: true,
        })
        if (sync.status !== 0) {
            throw new Error('sync-cnb-release failed')
        }

        console.log('')
        console.log('完成。可在浏览器打开：')
        console.log(`  https://cnb.cool/${args.cnbRepo}/-/releases/${encodeURIComponent(tag)}`)
        console.log(`  https://cnb.cool/${args.cnbRepo}/-/releases/latest/download/version.json`)
        console.log('')
    } finally {
        if (!args.keep) {
            try {
                rmSync(work, {recursive: true, force: true})
            } catch {
                // ignore
            }
        } else {
            console.log(`[keep] ${work}`)
        }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error('')
        console.error('失败:', error.message || error)
        console.error('')
        process.exitCode = 1
    })
}
