/**
 * Desktop release size ledger (PRODUCT_OPTIMIZATION_BACKLOG S-3 / A2).
 *
 * Usage:
 *   node scripts/desktop/size-report.mjs --dir <layoutDir> [--profile core] [--out path.json]
 *   node scripts/desktop/size-report.mjs --zip <release.zip> [--profile core] [--out path.json]
 *
 * Walks a packaged layout (or extracts a zip to a temp dir) and reports byte
 * totals for runtime / backend jar / plugins / drivers / frontend-dist / other.
 */
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs'
import {tmpdir} from 'node:os'
import {basename, dirname, join, relative, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {releaseDir} from './paths.mjs'

const TOP_BUCKETS = [
    'runtime',
    'backend',
    'plugins',
    'drivers',
    'frontend-dist',
    'app-native',
    'other',
]

/**
 * @param {string} root
 * @returns {{path: string, bytes: number}[]}
 */
function walkFiles(root) {
    /** @type {{path: string, bytes: number}[]} */
    const out = []
    /** @param {string} dir */
    function walk(dir) {
        let entries
        try {
            entries = readdirSync(dir, {withFileTypes: true})
        } catch {
            return
        }
        for (const entry of entries) {
            const full = join(dir, entry.name)
            if (entry.isDirectory()) {
                walk(full)
                continue
            }
            if (!entry.isFile()) continue
            try {
                out.push({path: full, bytes: statSync(full).size})
            } catch {
                // skip unreadable
            }
        }
    }
    walk(root)
    return out
}

/**
 * @param {string} relPosix
 * @param {string} prefix
 */
function under(relPosix, prefix) {
    return relPosix === prefix || relPosix.startsWith(`${prefix}/`) || relPosix.includes(`/${prefix}/`)
}

/**
 * @param {string} relPosix
 */
function classify(relPosix) {
    const p = relPosix.toLowerCase().replace(/\\/g, '/')
    if (
        under(p, 'runtime')
        || under(p, 'jbr')
        || p.includes('chromium embedded framework')
        || under(p, 'frameworks')
    ) {
        return 'runtime'
    }
    if (under(p, 'backend') || p.endsWith('datawise-server.jar')) {
        return 'backend'
    }
    if (under(p, 'plugins') || p.includes('/config-bundle/plugins/')) {
        return 'plugins'
    }
    if (under(p, 'drivers') || p.includes('/config-bundle/drivers/')) {
        return 'drivers'
    }
    // jpackage often puts SPA under app/ or frontend-dist/
    if (under(p, 'frontend-dist') || /(?:^|\/)app\/.+\.(js|css|html|svg|woff2?|png|ico)(?:\.|$)/.test(p)) {
        return 'frontend-dist'
    }
    if (
        p.endsWith('.exe')
        || p.endsWith('.dll')
        || p.endsWith('.so')
        || p.endsWith('.dylib')
        || /(^|\/)datawisecli(\.|$)/i.test(p)
    ) {
        return 'app-native'
    }
    return 'other'
}

/**
 * @param {string} layoutDir
 * @param {{profile?: string, source?: string}} [meta]
 */
export function buildSizeReport(layoutDir, meta = {}) {
    const root = resolve(layoutDir)
    if (!existsSync(root)) {
        throw new Error(`layout dir not found: ${root}`)
    }
    const files = walkFiles(root)
    /** @type {Record<string, number>} */
    const buckets = Object.fromEntries(TOP_BUCKETS.map((k) => [k, 0]))
    let totalBytes = 0
    for (const file of files) {
        const rel = relative(root, file.path).split(sep).join('/')
        const bucket = classify(rel)
        buckets[bucket] = (buckets[bucket] || 0) + file.bytes
        totalBytes += file.bytes
    }

    const largest = files
        .slice()
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 25)
        .map((f) => ({
            path: relative(root, f.path).split(sep).join('/'),
            bytes: f.bytes,
            mb: roundMb(f.bytes),
        }))

    return {
        generatedAt: new Date().toISOString(),
        profile: meta.profile || 'unknown',
        source: meta.source || root,
        layoutDir: root,
        fileCount: files.length,
        totalBytes,
        totalMb: roundMb(totalBytes),
        buckets: Object.fromEntries(
            TOP_BUCKETS.map((k) => [
                k,
                {
                    bytes: buckets[k] || 0,
                    mb: roundMb(buckets[k] || 0),
                    pct: totalBytes ? Math.round(((buckets[k] || 0) / totalBytes) * 1000) / 10 : 0,
                },
            ]),
        ),
        largest,
    }
}

/** @param {number} bytes */
function roundMb(bytes) {
    return Math.round((bytes / (1024 * 1024)) * 10) / 10
}

/**
 * @param {string} zipPath
 * @returns {string} temp extract dir
 */
function extractZip(zipPath) {
    const staging = mkdtempSync(join(tmpdir(), 'dw-size-'))
    if (process.platform === 'win32') {
        execFileSync(
            'powershell.exe',
            [
                '-NoProfile',
                '-Command',
                `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${staging.replace(/'/g, "''")}' -Force`,
            ],
            {stdio: 'inherit'},
        )
    } else if (process.platform === 'darwin') {
        execFileSync('ditto', ['-x', '-k', zipPath, staging], {stdio: 'inherit'})
    } else {
        execFileSync('unzip', ['-q', zipPath, '-d', staging], {stdio: 'inherit'})
    }
    return staging
}

function parseArgs(argv) {
    /** @type {Record<string, string|boolean>} */
    const out = {profile: 'core'}
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i]
        if (a === '--dir' && argv[i + 1]) {
            out.dir = argv[++i]
        } else if (a.startsWith('--dir=')) {
            out.dir = a.slice('--dir='.length)
        } else if (a === '--zip' && argv[i + 1]) {
            out.zip = argv[++i]
        } else if (a.startsWith('--zip=')) {
            out.zip = a.slice('--zip='.length)
        } else if (a === '--profile' && argv[i + 1]) {
            out.profile = argv[++i]
        } else if (a.startsWith('--profile=')) {
            out.profile = a.slice('--profile='.length)
        } else if (a === '--out' && argv[i + 1]) {
            out.out = argv[++i]
        } else if (a.startsWith('--out=')) {
            out.out = a.slice('--out='.length)
        } else if (a === '--help' || a === '-h') {
            out.help = true
        }
    }
    return out
}

function printHuman(report) {
    console.log(`[size-report] profile=${report.profile} total=${report.totalMb} MB (${report.fileCount} files)`)
    for (const key of TOP_BUCKETS) {
        const row = report.buckets[key]
        if (!row || row.bytes === 0) continue
        console.log(`  ${key.padEnd(14)} ${String(row.mb).padStart(7)} MB  ${String(row.pct).padStart(5)}%`)
    }
    // S-7: installers should not ship JDBC driver JARs (README.txt only ≈ empty).
    const driverBytes = report.buckets?.drivers?.bytes ?? 0
    if (driverBytes > 64_000) {
        console.warn(
            `[size-report] WARN drivers bucket is ${report.buckets.drivers.mb} MB — expected empty (download-on-connect). Check bundle-backend.`,
        )
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    if (args.help || (!args.dir && !args.zip)) {
        console.log(`Usage:
  node scripts/desktop/size-report.mjs --dir <layoutDir> [--profile core|slim|full] [--out path.json]
  node scripts/desktop/size-report.mjs --zip <release.zip> [--profile core] [--out path.json]`)
        process.exit(args.help ? 0 : 1)
    }

    let layoutDir = args.dir ? resolve(String(args.dir)) : ''
    let temp = ''
    try {
        if (args.zip) {
            const zipPath = resolve(String(args.zip))
            if (!existsSync(zipPath)) throw new Error(`zip not found: ${zipPath}`)
            console.log(`[size-report] extracting ${basename(zipPath)}…`)
            temp = extractZip(zipPath)
            layoutDir = temp
        }
        const report = buildSizeReport(layoutDir, {
            profile: String(args.profile || 'core'),
            source: args.zip ? resolve(String(args.zip)) : layoutDir,
        })
        printHuman(report)

        const outPath = args.out
            ? resolve(String(args.out))
            : join(releaseDir, `size-report-${report.profile}.json`)
        mkdirSync(dirname(outPath), {recursive: true})
        writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
        console.log(`[size-report] wrote ${outPath}`)
    } finally {
        if (temp) {
            rmSync(temp, {recursive: true, force: true})
        }
    }
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) {
    main().catch((err) => {
        console.error('[size-report]', err instanceof Error ? err.message : err)
        process.exit(1)
    })
}
