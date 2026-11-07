/**
 * Scan frontend for user-facing Chinese string literals outside locale files,
 * and for zh/en key-tree gaps.
 *
 * Usage: node scripts/i18n-audit-hardcoded.mjs
 */
import {readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs'
import {join, relative} from 'node:path'

const FE = join(import.meta.dirname, '..')
const SRC = join(FE, 'src')
const ZH = join(SRC, 'i18n/locales/zh-CN')
const EN = join(SRC, 'i18n/locales/en-US')

function loadLocale(file) {
    let s = readFileSync(file, 'utf8')
    s = s.replace(/^import[^\n]*\n/gm, '')
    s = s.replace(/^export default\s*/, '')
    return Function(`return (${s})`)()
}

function flatten(obj, prefix = '') {
    const out = []
    if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
        out.push(prefix)
        return out
    }
    for (const [k, v] of Object.entries(obj)) {
        const p = prefix ? `${prefix}.${k}` : k
        if (v != null && typeof v === 'object' && !Array.isArray(v)) out.push(...flatten(v, p))
        else out.push(p)
    }
    return out
}

function walkFiles(dir, acc = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist' || name === 'i18n') continue
        const p = join(dir, name)
        const st = statSync(p)
        if (st.isDirectory()) walkFiles(p, acc)
        else if (/\.(vue|ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) acc.push(p)
    }
    return acc
}

const zhFiles = readdirSync(ZH).filter((f) => f.endsWith('.ts') && f !== 'index.ts')
const enFiles = new Set(readdirSync(EN).filter((f) => f.endsWith('.ts') && f !== 'index.ts'))

const missingInEn = []
const missingInZh = []
const emptyEn = []
const chineseInEn = []

for (const f of zhFiles) {
    if (!enFiles.has(f)) {
        missingInEn.push(`${f} (entire file)`)
        continue
    }
    const zh = loadLocale(join(ZH, f))
    const en = loadLocale(join(EN, f))
    const zhKeys = new Set(flatten(zh))
    const enKeys = new Set(flatten(en))
    const ns = f.replace(/\.ts$/, '')
    for (const k of zhKeys) if (!enKeys.has(k)) missingInEn.push(`${ns}.${k}`)
    for (const k of enKeys) if (!zhKeys.has(k)) missingInZh.push(`${ns}.${k}`)
    const walk = (obj, prefix = '') => {
        for (const [k, v] of Object.entries(obj || {})) {
            const p = prefix ? `${prefix}.${k}` : k
            if (v != null && typeof v === 'object') walk(v, p)
            else if (typeof v === 'string') {
                if (!v.trim()) emptyEn.push(`${ns}.${p}`)
                if (/[\u4e00-\u9fff]/.test(v) && k !== 'zhCN') chineseInEn.push(`${ns}.${p}`)
            }
        }
    }
    walk(en)
}

/** Match string literals that contain Han; skip // and /* comments crudely. */
const STRING_RE = /(['"`])((?:\\.|(?!\1).)*[\u4e00-\u9fff](?:\\.|(?!\1).)*)\1/g

const hardcoded = []
for (const file of walkFiles(SRC)) {
    const rel = relative(SRC, file).replaceAll('\\', '/')
    if (rel.startsWith('i18n/')) continue
    if (rel.includes('__tests__/')) continue
    let text = readFileSync(file, 'utf8')
    // strip block comments
    text = text.replace(/\/\*[\s\S]*?\*\//g, '')
    // strip line comments (keep URLs)
    text = text.replace(/(^|[^:])\/\/.*$/gm, '$1')
    let m
    while ((m = STRING_RE.exec(text)) !== null) {
        const lit = m[2]
        // skip pure JSDoc leftovers / file headers that slipped
        if (lit.length > 120) continue
        hardcoded.push({file: rel, text: lit.slice(0, 80)})
    }
}

const report = {
    missingInEn,
    missingInZh,
    emptyEn,
    chineseInEn,
    hardcodedCount: hardcoded.length,
    hardcodedSample: hardcoded.slice(0, 120),
}

console.log(JSON.stringify({
    missingInEn: missingInEn.length,
    missingInZh: missingInZh.length,
    emptyEn,
    chineseInEn,
    hardcodedCount: hardcoded.length,
}, null, 2))
console.log('\n--- missingInEn ---')
missingInEn.forEach((x) => console.log(x))
console.log('\n--- hardcoded (first 80) ---')
hardcoded.slice(0, 80).forEach((h) => console.log(`${h.file}: ${h.text}`))

writeFileSync(join(FE, 'scripts/i18n-audit-report.json'), JSON.stringify(report, null, 2))
console.log('\nWrote scripts/i18n-audit-report.json')
