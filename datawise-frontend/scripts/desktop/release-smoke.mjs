/**
 * Post-pack smoke for desktop releases (PRODUCT_OPTIMIZATION_BACKLOG R-3).
 *
 * Validates size-report JSON + optional zip/layout naming. Does not launch the UI.
 *
 * Usage:
 *   node scripts/desktop/release-smoke.mjs --report release/size-report-core.json
 *   node scripts/desktop/release-smoke.mjs --report … --zip release/DataWiseCLI-….zip
 *   node scripts/desktop/release-smoke.mjs --report … --layout ../datawise-desktop/dist/windows
 */
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs'
import {basename, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {releaseDir} from './paths.mjs'

const MAX_DRIVERS_BYTES = 64_000
/** Soft floors — fail only if clearly broken (empty / missing runtime). */
const MIN_TOTAL_MB = 80
const MIN_RUNTIME_MB = 40
const MIN_BACKEND_MB = 5

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
    /** @type {Record<string, string|boolean>} */
    const out = {}
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i]
        if (a === '--report' && argv[i + 1]) out.report = argv[++i]
        else if (a.startsWith('--report=')) out.report = a.slice('--report='.length)
        else if (a === '--zip' && argv[i + 1]) out.zip = argv[++i]
        else if (a.startsWith('--zip=')) out.zip = a.slice('--zip='.length)
        else if (a === '--layout' && argv[i + 1]) out.layout = argv[++i]
        else if (a.startsWith('--layout=')) out.layout = a.slice('--layout='.length)
        else if (a === '--help' || a === '-h') out.help = true
    }
    return out
}

/**
 * @param {unknown} report
 * @returns {string[]}
 */
export function validateSizeReport(report) {
    /** @type {string[]} */
    const errors = []
    if (!report || typeof report !== 'object') {
        return ['size-report is not a JSON object']
    }
    const r = /** @type {Record<string, any>} */ (report)
    const profile = String(r.profile || '')
    if (!['slim', 'core', 'full'].includes(profile)) {
        errors.push(`profile must be slim|core|full (got ${profile || 'empty'})`)
    }
    if (!(r.totalBytes > 0) || !(r.totalMb >= MIN_TOTAL_MB)) {
        errors.push(`totalMb too small (${r.totalMb ?? '?'}; expect ≥ ${MIN_TOTAL_MB})`)
    }
    const runtimeMb = r.buckets?.runtime?.mb
    if (!(runtimeMb >= MIN_RUNTIME_MB)) {
        errors.push(`runtime bucket too small (${runtimeMb ?? '?'}; expect ≥ ${MIN_RUNTIME_MB} MB jbr_jcef)`)
    }
    const backendMb = r.buckets?.backend?.mb
    if (!(backendMb >= MIN_BACKEND_MB)) {
        errors.push(`backend bucket too small (${backendMb ?? '?'}; expect ≥ ${MIN_BACKEND_MB} MB)`)
    }
    const driverBytes = r.buckets?.drivers?.bytes ?? 0
    if (driverBytes > MAX_DRIVERS_BYTES) {
        errors.push(
            `drivers bucket ${driverBytes} bytes — installers must not ship JDBC JARs (S-7)`,
        )
    }
    if (profile === 'core' || profile === 'slim') {
        const pluginsMb = r.buckets?.plugins?.mb ?? 0
        if (profile === 'slim' && pluginsMb > 1) {
            errors.push(`slim profile plugins bucket ${pluginsMb} MB — expected ~0`)
        }
    }
    if (!Array.isArray(r.largest) || r.largest.length === 0) {
        errors.push('largest[] missing — report looks incomplete')
    }
    return errors
}

/**
 * @param {string} zipPath
 * @param {string} profile
 */
export function validateReleaseZipName(zipPath, profile) {
    const name = basename(zipPath)
    if (!name.startsWith('DataWiseCLI-') || !name.endsWith('.zip')) {
        return [`zip name unexpected: ${name}`]
    }
    if (profile === 'core') {
        if (name.includes('-slim-') || name.includes('-full-')) {
            return [`core zip must not contain slim/full token: ${name}`]
        }
        return []
    }
    if (!name.includes(`-${profile}-`)) {
        return [`${profile} zip must include -${profile}- in name: ${name}`]
    }
    return []
}

/**
 * @param {string} markerPath
 * @param {string} [expectedProfile]
 */
export function validateDesktopPackagingMarker(markerPath, expectedProfile) {
    /** @type {string[]} */
    const errors = []
    if (!existsSync(markerPath)) {
        return [`desktop-packaging.json missing: ${markerPath}`]
    }
    try {
        const marker = JSON.parse(readFileSync(markerPath, 'utf8'))
        const profile = String(marker?.profile || '')
        if (!['slim', 'core', 'full'].includes(profile)) {
            errors.push(`desktop-packaging profile must be slim|core|full (got ${profile || 'empty'})`)
        }
        if (expectedProfile && profile !== expectedProfile) {
            errors.push(`desktop-packaging profile=${profile} but expected ${expectedProfile}`)
        }
        if (String(marker?.drivers || '') !== 'download-on-connect') {
            errors.push('desktop-packaging drivers must be download-on-connect')
        }
    } catch (err) {
        errors.push(`desktop-packaging.json unreadable: ${err instanceof Error ? err.message : err}`)
    }
    return errors
}

/**
 * @param {string} root
 * @returns {string|null}
 */
function findDesktopPackagingMarker(root) {
    const hints = [
        join(root, 'config', 'desktop-packaging.json'),
        join(root, 'app', 'config', 'desktop-packaging.json'),
        join(root, 'Contents', 'app', 'config', 'desktop-packaging.json'),
        join(root, 'config-bundle', 'desktop-packaging.json'),
    ]
    for (const hint of hints) {
        if (existsSync(hint)) return hint
    }
    try {
        for (const name of readdirSync(root)) {
            const nested = [
                join(root, name, 'config', 'desktop-packaging.json'),
                join(root, name, 'app', 'config', 'desktop-packaging.json'),
                join(root, name, 'Contents', 'app', 'config', 'desktop-packaging.json'),
            ]
            for (const candidate of nested) {
                if (existsSync(candidate)) return candidate
            }
        }
    } catch {
        // ignore
    }
    return null
}

/**
 * @param {string} layoutDir
 * @param {string} [expectedProfile]
 */
export function validateLayoutSmoke(layoutDir, expectedProfile) {
    /** @type {string[]} */
    const errors = []
    const root = resolve(layoutDir)
    if (!existsSync(root)) {
        return [`layout not found: ${root}`]
    }
    const jarHints = [
        join(root, 'app', 'datawise-server.jar'),
        join(root, 'datawise-server.jar'),
        // macOS jpackage: DataWiseCLI.app/Contents/app/datawise-server.jar
        join(root, 'Contents', 'app', 'datawise-server.jar'),
    ]
    if (!jarHints.some((p) => existsSync(p))) {
        // Walk one level for jpackage layouts (Windows/Linux app dir, macOS .app bundle)
        let found = false
        try {
            for (const name of readdirSync(root)) {
                const candidates = [
                    join(root, name, 'app', 'datawise-server.jar'),
                    join(root, name, 'Contents', 'app', 'datawise-server.jar'),
                ]
                if (candidates.some((candidate) => existsSync(candidate))) {
                    found = true
                    break
                }
            }
        } catch {
            // ignore
        }
        if (!found) errors.push('datawise-server.jar not found under layout')
    }
    const marker = findDesktopPackagingMarker(root)
    if (!marker) {
        errors.push('desktop-packaging.json not found under layout config/')
    } else {
        errors.push(...validateDesktopPackagingMarker(marker, expectedProfile))
    }
    return errors
}

function fail(msg) {
    console.error(`[release-smoke] FAIL ${msg}`)
}

function ok(msg) {
    console.log(`[release-smoke] OK ${msg}`)
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    if (args.help || !args.report) {
        console.log(`Usage:
  node scripts/desktop/release-smoke.mjs --report <size-report.json> [--zip <portable.zip>] [--layout <dir>]`)
        process.exit(args.help ? 0 : 1)
    }

    const reportPath = resolve(String(args.report))
    if (!existsSync(reportPath)) {
        fail(`report not found: ${reportPath}`)
        process.exit(1)
    }

    /** @type {string[]} */
    let errors = []
    let report
    try {
        report = JSON.parse(readFileSync(reportPath, 'utf8'))
    } catch (err) {
        fail(`cannot parse report: ${err instanceof Error ? err.message : err}`)
        process.exit(1)
    }

    errors = errors.concat(validateSizeReport(report))
    if (errors.length === 0) {
        ok(`size-report profile=${report.profile} total=${report.totalMb} MB`)
    }

    if (args.zip) {
        const zipPath = resolve(String(args.zip))
        if (!existsSync(zipPath)) {
            errors.push(`zip not found: ${zipPath}`)
        } else {
            const st = statSync(zipPath)
            if (st.size < 10_000_000) {
                errors.push(`zip too small (${st.size} bytes)`)
            } else {
                ok(`zip ${basename(zipPath)} (${Math.round(st.size / (1024 * 1024))} MB)`)
            }
            errors = errors.concat(validateReleaseZipName(zipPath, String(report.profile || '')))
        }
    }

    if (args.layout) {
        errors = errors.concat(validateLayoutSmoke(String(args.layout), String(report.profile || '')))
        if (!errors.some((e) => e.includes('layout') || e.includes('desktop-packaging'))) {
            ok(`layout ${resolve(String(args.layout))}`)
        }
    }

    if (errors.length) {
        for (const e of errors) fail(e)
        console.error(`[release-smoke] ${errors.length} check(s) failed`)
        process.exit(1)
    }

    console.log(`[release-smoke] all checks passed → ${reportPath}`)
    if (!args.zip && !args.layout) {
        console.log(`[release-smoke] tip: pass --zip or --layout for artifact path checks`)
    }
    // Keep releaseDir referenced so tooling knows default report home
    void releaseDir
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) {
    main().catch((err) => {
        fail(err instanceof Error ? err.message : String(err))
        process.exit(1)
    })
}
