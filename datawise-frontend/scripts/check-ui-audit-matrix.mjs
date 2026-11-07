/**
 * Optional dual-skin capture check — verifies classic + ide audit folders exist
 * after `npm run capture:ui-audit`. Does not launch the browser.
 *
 *   npm run check:ui-audit --prefix datawise-frontend
 */
import {existsSync, readdirSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'assets', 'ui-audit')
const SKINS = ['classic', 'ide']
const REQUIRED = [
    '01-dashboard.png',
    '03-sql-console.png',
    '05-plugins.png',
    '07-settings-basic.png',
    '08-settings-health.png',
]

const missing = []
for (const skin of SKINS) {
    const dir = join(ROOT, skin)
    if (!existsSync(dir)) {
        missing.push(`${skin}/ (directory)`)
        continue
    }
    const files = new Set(readdirSync(dir))
    for (const name of REQUIRED) {
        if (!files.has(name)) missing.push(`${skin}/${name}`)
    }
}

if (missing.length) {
    console.error('check:ui-audit missing:')
    for (const m of missing) console.error(`  - ${m}`)
    console.error('\nRun: npm run capture:ui-audit --prefix datawise-frontend')
    process.exit(1)
}

console.log(`check:ui-audit ok (${SKINS.length} skins, ${REQUIRED.length} required shots each)`)
