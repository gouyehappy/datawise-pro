/**
 * Baseline gate: features/app/core must not grow new deep imports of @/shared/api.
 * UI should enter via @/api (see src/api/index.ts).
 *
 * Usage:
 *   node scripts/audit-api-facade-imports.mjs
 *   node scripts/audit-api-facade-imports.mjs --write-baseline
 */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptDir, '..')
const srcRoot = path.join(frontendRoot, 'src')
const baselinePath = path.join(scriptDir, 'api-facade-imports-baseline.json')

const SCAN_DIRS = ['features', 'app', 'core']
const EXT_RE = /\.(ts|tsx|vue)$/
/** Direct @/shared/api or @/shared/api/... (not @/shared/api-something) */
const IMPORT_RE = /(?:from|import)\s+['"]@\/shared\/api(?:\/[^'"]*)?['"]/g

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

function countImports(filePath) {
    const text = fs.readFileSync(filePath, 'utf8')
    const matches = text.match(IMPORT_RE)
    return matches ? matches.length : 0
}

function collect() {
    const byFile = {}
    let total = 0
    for (const rel of SCAN_DIRS) {
        const abs = path.join(srcRoot, rel)
        for (const file of walk(abs)) {
            const count = countImports(file)
            if (count <= 0) continue
            const key = path.relative(frontendRoot, file).replaceAll('\\', '/')
            byFile[key] = count
            total += count
        }
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
            note: 'Refuse new features/app/core → @/shared/api deep imports; use @/api. Lower maxTotal when cleaning debt.',
            byFile: snapshot.byFile,
        }
        fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
        console.log(`Wrote baseline maxTotal=${snapshot.total} → ${path.relative(frontendRoot, baselinePath)}`)
        process.exitCode = 0
        return
    }

    if (!fs.existsSync(baselinePath)) {
        console.error(`Missing baseline: ${baselinePath}`)
        console.error('Run: node scripts/audit-api-facade-imports.mjs --write-baseline')
        process.exitCode = 1
        return
    }

    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    const maxTotal = Number(baseline.maxTotal)
    console.log('API facade import audit (features/app/core → @/shared/api)')
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
