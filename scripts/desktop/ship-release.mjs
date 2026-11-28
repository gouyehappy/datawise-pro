#!/usr/bin/env node
/**
 * Windows-friendly desktop release helper.
 *
 * Version policy (bugfix after a released X.Y.Z):
 *   patch  → X.Y.(Z+1)     e.g. 5.0.0 → 5.0.1   ← default for “修了一堆 bug 再发一版”
 *   minor  → X.(Y+1).0
 *   major  → (X+1).0.0
 * Git tag is always vX.Y.Z
 *
 * Foolproof (PowerShell, repo root):
 *   npm run ship:status
 *   npm run ship:release -- --bump patch --yes
 *     → bump versions, commit chore(release), push branch, tag+push vX.Y.Z
 *       (triggers desktop-release.yml)
 *   npm run mirror:cnb -- --tag vX.Y.Z
 *     → after CI assets exist, mirror incremental packs to CNB
 *
 * Safer split:
 *   npm run ship:release -- --bump patch --step bump
 *   npm run ship:release -- --bump patch --step commit
 *   npm run ship:release -- --bump patch --step tag
 */
import {spawnSync} from 'node:child_process'
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ALIGN = join(ROOT, 'datawise-frontend', 'scripts', 'desktop', 'align-release-version.mjs')

function run(cmd, args, opts = {}) {
    const result = spawnSync(cmd, args, {
        cwd: ROOT,
        encoding: 'utf8',
        shell: process.platform === 'win32' && cmd === 'npm',
        windowsHide: true,
        ...opts,
    })
    if (opts.allowFail) return result
    if (result.status !== 0) {
        const err = (result.stderr || result.stdout || '').trim()
        throw new Error(`${cmd} ${args.join(' ')} failed${err ? `\n${err}` : ''}`)
    }
    return result
}

function git(args, opts = {}) {
    return run('git', args, opts)
}

function gitOut(args) {
    return (git(args).stdout || '').trim()
}

function parseArgs(argv) {
    const out = {
        bump: '', // patch | minor | major | X.Y.Z
        step: 'all', // status | bump | commit | tag | all
        yes: false,
        skipCiCheck: false,
        remote: 'origin',
        message: '',
        dryRun: false,
        noVerify: false,
    }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--bump') out.bump = argv[++i]
        else if (a === '--version') out.bump = argv[++i]
        else if (a === '--step') out.step = argv[++i]
        else if (a === '--yes' || a === '-y') out.yes = true
        else if (a === '--skip-ci-check') out.skipCiCheck = true
        else if (a === '--remote') out.remote = argv[++i]
        else if (a === '--message') out.message = argv[++i]
        else if (a === '--dry-run') out.dryRun = true
        else if (a === '--no-verify') out.noVerify = true
        else if (a === '--help' || a === '-h') {
            printHelp()
            process.exit(0)
        } else throw new Error(`unknown arg: ${a}`)
    }
    return out
}

function printHelp() {
    console.log(`
DataWise 发版助手（Windows）

版本怎么定（修 bug 再发）：
  当前已发布 5.0.0 → 用 patch → 5.0.1
  --bump patch | minor | major | 5.0.1

常用：
  npm run ship:status
  npm run ship:release -- --bump patch --yes

分步：
  npm run ship:release -- --bump patch --step bump
  npm run ship:release -- --bump patch --step commit
  npm run ship:release -- --bump patch --step tag

说明：
  · bump   改各处版本号（不提交）
  · commit 提交 chore(release): bump version to X.Y.Z
  · tag    push 当前分支 + 打 annotated tag vX.Y.Z 并 push（触发 desktop-release）
  · 功能代码请先自己 commit；本脚本默认拒绝在「未提交改动」时 tag
  · CI 绿了以后：npm run mirror:cnb -- --tag vX.Y.Z
`)
}

function readCurrentVersion() {
    const xml = readFileSync(join(ROOT, 'datawise-backend', 'pom.xml'), 'utf8')
    const m = xml.match(/<artifactId>datawise-backend<\/artifactId>\s*<version>([^<]+)<\/version>/)
    if (!m) throw new Error('cannot read version from datawise-backend/pom.xml')
    return m[1].trim()
}

function parseSemver(v) {
    const m = String(v).replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)$/)
    if (!m) throw new Error(`version must be X.Y.Z, got ${v}`)
    return {major: +m[1], minor: +m[2], patch: +m[3], text: `${m[1]}.${m[2]}.${m[3]}`}
}

function isExplicitVersion(bump) {
    return /^\d+\.\d+\.\d+$/.test(String(bump)) || /^v\d+\.\d+\.\d+$/.test(String(bump))
}

function nextVersion(current, bump) {
    const cur = parseSemver(current)
    if (isExplicitVersion(bump)) {
        return parseSemver(bump).text
    }
    if (bump === 'patch') return `${cur.major}.${cur.minor}.${cur.patch + 1}`
    if (bump === 'minor') return `${cur.major}.${cur.minor + 1}.0`
    if (bump === 'major') return `${cur.major + 1}.0.0`
    throw new Error(`--bump must be patch|minor|major|X.Y.Z (got ${bump || '(empty)'})`)
}

/**
 * bump/all → compute next from --bump
 * commit/tag → use workspace version (already bumped); do not patch again
 */
function resolveTargetVersion(current, bump, step) {
    if (isExplicitVersion(bump)) return parseSemver(bump).text
    if (step === 'commit' || step === 'tag') return current
    return nextVersion(current, bump || 'patch')
}

function replaceOnce(file, pattern, replacement, label) {
    const abs = join(ROOT, file)
    if (!existsSync(abs)) {
        console.warn(`[ship] skip missing ${file}`)
        return
    }
    const before = readFileSync(abs, 'utf8')
    if (!pattern.test(before)) {
        // already at target or different format
        if (before.includes(replacement.replace(/\$\d/g, ''))) {
            console.log(`[ship] ${label}: already ok`)
            return
        }
        console.warn(`[ship] ${label}: pattern not found in ${file}`)
        return
    }
    const after = before.replace(pattern, replacement)
    if (after === before) {
        console.log(`[ship] ${label}: unchanged`)
        return
    }
    writeFileSync(abs, after, 'utf8')
    console.log(`[ship] ${label}: updated`)
}

/** Extra files align-release-version.mjs does not touch but product/CI expect. */
function bumpExtraFiles(version) {
    replaceOnce(
        'datawise-desktop/installer/ui/package.json',
        /("version"\s*:\s*")\d+\.\d+\.\d+(")/,
        `$1${version}$2`,
        'installer/ui package.json',
    )
    replaceOnce(
        'package.json',
        /("version"\s*:\s*")\d+\.\d+\.\d+(")/,
        `$1${version}$2`,
        'root package.json',
    )
    replaceOnce(
        'datawise-desktop/src/main/java/org/apache/datawise/desktop/updater/DesktopUpdaterService.java',
        /(CURRENT_VERSION\s*=\s*")\d+\.\d+\.\d+(")/,
        `$1${version}$2`,
        'DesktopUpdaterService.CURRENT_VERSION',
    )
    replaceOnce(
        'datawise-desktop/src/main/java/org/apache/datawise/desktop/cef/CefRuntimeConfig.java',
        /(DataWiseCLI\/)\d+\.\d+\.\d+/,
        `$1${version}`,
        'CefRuntimeConfig UA',
    )
    replaceOnce(
        'datawise-frontend/src/features/layout/services/release-highlights.service.ts',
        /(RELEASE_HIGHLIGHTS_VERSION\s*=\s*'v)\d+\.\d+\.\d+(')/,
        `$1${version}$2`,
        'release-highlights',
    )
}

function printStatus() {
    const current = readCurrentVersion()
    const branch = gitOut(['branch', '--show-current'])
    const dirty = gitOut(['status', '--porcelain'])
    const suggested = nextVersion(current, 'patch')
    let latestTag = ''
    try {
        latestTag = gitOut(['describe', '--tags', '--abbrev=0'])
    } catch {
        latestTag = '(none)'
    }
    console.log('')
    console.log('=== DataWise 发版状态 ===')
    console.log(`当前产品版本 : ${current}`)
    console.log(`建议下一版   : ${suggested}  (bugfix 用 patch)`)
    console.log(`最近 git tag : ${latestTag}`)
    console.log(`当前分支     : ${branch}`)
    console.log(`工作区       : ${dirty ? '有未提交改动' : '干净'}`)
    if (dirty) {
        console.log('')
        console.log(dirty)
        console.log('')
        console.log('下一步建议：')
        console.log('  1) 先把功能/修复 commit 掉')
        console.log('  2) npm run ship:release -- --bump patch --yes')
    } else {
        console.log('')
        console.log('可执行：')
        console.log(`  npm run ship:release -- --bump patch --yes`)
        console.log(`  # 将发 v${suggested}`)
    }
    console.log('')
}

function assertCleanForTag() {
    const dirty = gitOut(['status', '--porcelain'])
    if (dirty) {
        throw new Error(
            '工作区不干净，不能打 tag。\n请先提交功能改动，再跑 bump/commit/tag。\n' + dirty,
        )
    }
}

function stepBump(version, dryRun) {
    console.log(`\n[bump] → ${version}`)
    if (dryRun) {
        console.log('[dry-run] would run align-release-version + extras')
        return
    }
    run(process.execPath, [ALIGN, version], {stdio: 'inherit'})
    bumpExtraFiles(version)
    console.log(`[bump] done ${version}`)
}

function stepCommit(version, message, dryRun) {
    console.log(`\n[commit] chore(release): bump version to ${version}`)
    if (dryRun) return
    // Only add paths that exist — one missing path makes the whole `git add` fail on Windows.
    const candidates = [
        'package.json',
        'datawise-frontend/package.json',
        'datawise-frontend/package-lock.json',
        'datawise-desktop/pom.xml',
        'datawise-desktop/installer/ui/package.json',
        'datawise-desktop/src/main/java/org/apache/datawise/desktop/updater/DesktopUpdaterService.java',
        'datawise-desktop/src/main/java/org/apache/datawise/desktop/cef/CefRuntimeConfig.java',
        'datawise-frontend/src/features/layout/services/release-highlights.service.ts',
        'datawise-backend',
    ]
    const toAdd = candidates.filter((p) => existsSync(join(ROOT, p)))
    if (!toAdd.length) {
        throw new Error('没有可提交的版本路径（仓库结构异常）')
    }
    git(['add', '--', ...toAdd])
    const staged = gitOut(['diff', '--cached', '--name-only'])
    if (!staged) {
        throw new Error('没有可提交的版本改动（是否已 bump？）')
    }
    const msg = message || `chore(release): bump version to ${version}`
    // Avoid PowerShell eating HEREDOC — use -m directly (no multiline needed)
    git(['commit', '-m', msg], {stdio: 'inherit'})
}

function stepTag(version, remote, skipCiCheck, yes, dryRun, noVerify = false) {
    const tag = `v${version}`
    const branch = gitOut(['branch', '--show-current'])
    console.log(`\n[tag] ${tag} on branch ${branch}`)
    assertCleanForTag()

    const existing = git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`], {allowFail: true})
    if (existing.status === 0) {
        throw new Error(`本地已存在 tag ${tag}`)
    }

    if (!skipCiCheck && !yes) {
        console.log('[tag] 提示：正式发版前建议确认 GitHub Frontend/Backend tests 已绿。')
        console.log('      若已确认，请加 --yes；若暂时跳过检查加 --skip-ci-check --yes')
        throw new Error('拒绝打 tag：需要 --yes（并建议 CI 已绿）')
    }
    if (!yes) {
        throw new Error('拒绝 push/tag：请加 --yes')
    }

    if (dryRun) {
        console.log(
            `[dry-run] would: git push${noVerify ? ' --no-verify' : ''} ${remote} ${branch}; git tag -a ${tag}; git push${noVerify ? ' --no-verify' : ''} ${remote} ${tag}`,
        )
        return
    }

    const pushExtra = noVerify ? ['--no-verify'] : []
    if (noVerify) {
        console.log('[tag] 使用 --no-verify（跳过 weekday pre-push hook）')
    }

    console.log(`[tag] push ${remote} ${branch}…`)
    const pushBranch = git(
        ['push', ...pushExtra, remote, `HEAD:refs/heads/${branch}`],
        {stdio: 'inherit', allowFail: true},
    )
    if (pushBranch.status !== 0) {
        throw new Error(
            `git push 分支失败。若是工作日 hook：菜单选「紧急 push」或加 --no-verify`,
        )
    }

    git(['tag', '-a', tag, '-m', `Release ${version}`], {stdio: 'inherit'})
    console.log(`[tag] push ${remote} ${tag}…`)
    const pushTag = git(['push', ...pushExtra, remote, tag], {stdio: 'inherit', allowFail: true})
    if (pushTag.status !== 0) {
        throw new Error(`git push tag 失败。本地 tag ${tag} 可能已创建；修好后: git push${noVerify ? ' --no-verify' : ''} ${remote} ${tag}`)
    }

    console.log('')
    console.log('已推送 tag，GitHub Actions「Desktop release」应已开始。')
    console.log('打包完成后（约十几分钟～更久）：')
    console.log(`  npm run mirror:cnb -- --tag ${tag}`)
    console.log('')
    try {
        const url = gitOut(['remote', 'get-url', remote])
        const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/)
        if (m) {
            console.log(`Actions: https://github.com/${m[1]}/actions`)
            console.log(`Release: https://github.com/${m[1]}/releases/tag/${tag}`)
        }
    } catch {
        // ignore
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    if (args.step === 'status' || (!args.bump && args.step === 'all' && !args.yes)) {
        printStatus()
        if (args.step === 'status' || !args.bump) return
    }

    const current = readCurrentVersion()
    if (!args.bump) args.bump = 'patch'
    const version = resolveTargetVersion(current, args.bump, args.step)
    const tag = `v${version}`

    console.log('')
    if (args.step === 'commit' || args.step === 'tag') {
        console.log(`工作区版本 ${current} → 将使用 ${version} (tag ${tag})`)
    } else {
        console.log(`当前 ${current} → 目标 ${version} (tag ${tag})`)
    }
    console.log(`步骤 ${args.step}`)
    console.log('')

    if (args.step === 'bump') {
        stepBump(version, args.dryRun)
        return
    }
    if (args.step === 'commit') {
        stepCommit(version, args.message, args.dryRun)
        return
    }
    if (args.step === 'tag') {
        if (readCurrentVersion() !== version) {
            throw new Error(`工作区版本是 ${readCurrentVersion()}，与目标 ${version} 不一致。先 --step bump && commit`)
        }
        stepTag(version, args.remote, args.skipCiCheck, args.yes, args.dryRun, args.noVerify)
        return
    }
    if (args.step === 'all') {
        // Feature commits must already be done
        const dirtyBefore = gitOut(['status', '--porcelain'])
        if (dirtyBefore) {
            console.error('工作区还有未提交改动。请先提交功能/修复，再发版。')
            console.error('')
            console.error(dirtyBefore)
            console.error('')
            console.error('提交完后执行：')
            console.error(`  npm run ship:release -- --bump ${args.bump} --yes`)
            process.exitCode = 1
            return
        }
        stepBump(version, args.dryRun)
        stepCommit(version, args.message, args.dryRun)
        stepTag(version, args.remote, args.skipCiCheck, args.yes, args.dryRun, args.noVerify)
        return
    }
    throw new Error(`unknown --step ${args.step}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((e) => {
        console.error('')
        console.error('失败:', e.message || e)
        console.error('')
        process.exitCode = 1
    })
}
