/**
 * Baseline gate: cross-feature deep paths (@/features/X/y/z) must not grow.
 * Prefer importing from @/features/<name> public index when available.
 * Same-feature imports (@/features/foo/... from within features/foo) are ignored.
 *
 * Usage:
 *   node scripts/audit-feature-deep-imports.mjs
 *   node scripts/audit-feature-deep-imports.mjs --write-baseline
 */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptDir, '..')
const featuresRoot = path.join(frontendRoot, 'src', 'features')
const baselinePath = path.join(scriptDir, 'feature-deep-imports-baseline.json')

const EXT_RE = /\.(ts|tsx|vue)$/
const IMPORT_RE = /(?:from|import)\s+['"]@\/features\/([^/'"]+)\/([^'"]+)['"]/g

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist') continue
            walk(full, out)
        } else if (EXT_RE.test(entry.name)) {
            out.push(full)
        }
    }
    return out
}

function featureOfFile(filePath) {
    const rel = path.relative(featuresRoot, filePath).replaceAll('\\', '/')
    const seg = rel.split('/')[0]
    return seg || null
}

function countCrossFeatureDeepImports(filePath) {
    const selfFeature = featureOfFile(filePath)
    if (!selfFeature) return 0
    const text = fs.readFileSync(filePath, 'utf8')
    let count = 0
    for (const match of text.matchAll(IMPORT_RE)) {
        const targetFeature = match[1]
        if (targetFeature && targetFeature !== selfFeature) count += 1
    }
    return count
}

function collect() {
    const byFile = {}
    let total = 0
    for (const file of walk(featuresRoot)) {
        const count = countCrossFeatureDeepImports(file)
        if (count <= 0) continue
        const key = path.relative(frontendRoot, file).replaceAll('\\', '/')
        byFile[key] = count
        total += count
    }
    return {total, byFile}
}

function main() {
    const writeBaseline = process.argv.includes('--write-baseline')
    const snapshot = collect()

    if (writeBaseline) {
        const payload = {
            generatedAt: new Date().toISOString(),
            maxTotal: snapshot.total,
            note: 'Refuse growth of cross-feature deep imports; use features/*/index.ts. Lower maxTotal when cleaning.',
            byFile: snapshot.byFile,
        }
        fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
        console.log(`Wrote baseline maxTotal=${snapshot.total} → ${path.relative(frontendRoot, baselinePath)}`)
        process.exitCode = 0
        return
    }

    if (!fs.existsSync(baselinePath)) {
        console.error(`Missing baseline: ${baselinePath}`)
        console.error('Run: node scripts/audit-feature-deep-imports.mjs --write-baseline')
        process.exitCode = 1
        return
    }

    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    const maxTotal = Number(baseline.maxTotal)
    console.log('Feature deep-import audit (cross-feature @/features/X/...)')
    console.log(`  current: ${snapshot.total}`)
    console.log(`  baseline maxTotal: ${maxTotal}`)

    if (snapshot.total > maxTotal) {
        console.error(`  status: FAIL (grew by ${snapshot.total - maxTotal})`)
        const baselineFiles = baseline.byFile || {}
        for (const [file, count] of Object.entries(snapshot.byFile).sort()) {
            const prev = baselineFiles[file] ?? 0
            if (count > prev) console.error(`  + ${file}: ${prev} → ${count}`)
        }
        for (const file of Object.keys(snapshot.byFile)) {
            if (!(file in baselineFiles)) {
                console.error(`  + new file: ${file} (${snapshot.byFile[file]})`)
            }
        }
        process.exitCode = 1
        return
    }

    console.log('  status: OK')
    process.exitCode = 0
}

main()
