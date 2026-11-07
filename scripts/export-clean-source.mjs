/**
 * Export a clean source tree for a fresh remote upload (no .git history).
 *
 *   node scripts/export-clean-source.mjs
 *   node scripts/export-clean-source.mjs --out ../datawise-clean
 *
 * Uses `git archive` of HEAD when possible; falls back to a filtered copy.
 * Always excludes _private/, config runtime, build outputs, node_modules, etc.
 */
import {spawnSync} from 'node:child_process'
import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outArg = process.argv.includes('--out')
    ? process.argv[process.argv.indexOf('--out') + 1]
    : join(root, '..', `datawise-clean-${stamp()}`)

const SKIP_DIR_NAMES = new Set([
    '.git',
    '_private',
    'node_modules',
    'target',
    'dist',
    'dist-electron',
    'release',
    '.codegraph',
    '.vibe',
    '.claude',
    '.idea',
    '.vscode',
    'test-results',
    '.dwp-staging',
    '.dbx-clone',
    '.dbx-ref',
    'jbr-cache',
    'jcef-maven-cache',
])

function stamp() {
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function log(msg) {
    console.log(`[export-clean] ${msg}`)
}

function shouldSkipDir(name) {
    return SKIP_DIR_NAMES.has(name) || name.startsWith('release-')
}

function copyFiltered(src, dst) {
    mkdirSync(dst, {recursive: true})
    for (const name of readdirSync(src)) {
        if (name === '.' || name === '..') continue
        const from = join(src, name)
        const to = join(dst, name)
        const st = statSync(from)
        if (st.isDirectory()) {
            if (shouldSkipDir(name)) continue
            // community-plugins/*/backend/target already covered by name===target
            copyFiltered(from, to)
            continue
        }
        if (name === 'repo.meta.json') continue
        if (/\.(priv\.pem|p12|jks)$/i.test(name)) continue
        cpSync(from, to)
    }
}

function tryGitArchive(dest) {
    if (!existsSync(join(root, '.git'))) return false
    const tmp = mkdtempSync(join(tmpdir(), 'dw-archive-'))
    const tar = join(tmp, 'src.tar')
    const arch = spawnSync(
        'git',
        ['-C', root, 'archive', '--format=tar', '-o', tar, 'HEAD'],
        {stdio: 'inherit'},
    )
    if (arch.status !== 0) {
        rmSync(tmp, {recursive: true, force: true})
        return false
    }
    mkdirSync(dest, {recursive: true})
    const extract = spawnSync('tar', ['-xf', tar, '-C', dest], {stdio: 'inherit'})
    rmSync(tmp, {recursive: true, force: true})
    if (extract.status !== 0) return false
    // git archive still contains paths we no longer want if they were tracked historically;
    // strip private leftovers if any leaked into the tree.
    for (const name of ['_private', 'docs/design', 'docs/todolist', 'docs/reviews']) {
        const p = join(dest, ...name.split('/'))
        if (existsSync(p)) rmSync(p, {recursive: true, force: true})
    }
    // Legacy review notes lived at docs/code-review-*.md
    const docsDir = join(dest, 'docs')
    if (existsSync(docsDir)) {
        for (const name of readdirSync(docsDir)) {
            if (/^code-review-.*\.md$/i.test(name)) {
                rmSync(join(docsDir, name), {force: true})
            }
        }
    }
    return true
}

const dest = resolve(outArg)
if (existsSync(dest)) {
    log(`clearing ${dest}`)
    rmSync(dest, {recursive: true, force: true})
}
mkdirSync(dest, {recursive: true})

log(`export → ${dest}`)
const usedGit = tryGitArchive(dest)
if (!usedGit) {
    log('git archive unavailable; filtered copy of working tree')
    copyFiltered(root, dest)
} else {
    log('git archive OK; removing any residual private/runtime paths')
    for (const name of ['_private', 'config/secrets', 'config/tenants', 'config/users.json']) {
        const p = join(dest, ...name.split('/'))
        if (existsSync(p)) rmSync(p, {recursive: true, force: true})
    }
}

// Ensure example identity is present; never copy filled repo.meta.json
cpSync(join(root, 'repo.meta.example.json'), join(dest, 'repo.meta.example.json'))
writeFileSync(
    join(dest, 'EXPORT_NOTES.txt'),
    [
        'Clean DataWise source export',
        '',
        '1. Copy repo.meta.example.json → repo.meta.json and set githubOwner / githubRepo',
        '   (or export DATAWISE_GITHUB_REPO=owner/name).',
        '2. git init && git add . && git commit && git remote add origin <your-repo>',
        '3. Do NOT copy _private/, config runtime secrets, or build outputs into the new remote.',
        '4. Public docs live under docs/ (user-manual, packaging, deployment). Design docs stay local only.',
        '',
    ].join('\n'),
    'utf8',
)

log('done')
log(`next: cd "${dest}" && copy repo.meta.example.json repo.meta.json && git init`)
