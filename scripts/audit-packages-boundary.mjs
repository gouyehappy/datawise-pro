/**
 * Fail if packages/ imports host product APIs or Pinia / vue-i18n directly.
 *
 * Usage: node scripts/audit-packages-boundary.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packagesRoot = path.join(root, 'packages')

const EXT_RE = /\.(ts|tsx|vue|js|mjs)$/
const FORBIDDEN = [
    {id: '@/features/', re: /@\/features\//},
    {id: '@/shared/api', re: /@\/shared\/api\b/},
    {id: '@/shared/connection', re: /@\/shared\/connection\b/},
    {id: 'defineStore(', re: /\bdefineStore\s*\(/},
    {id: 'useI18n(', re: /\buseI18n\s*\(/},
]

function isI18nAdapterFile(filePath) {
    const base = path.basename(filePath).toLowerCase()
    return base.includes('vue-i18n-adapter') || base.includes('i18n-adapter')
}

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

function main() {
    if (!fs.existsSync(packagesRoot)) {
        console.log('packages/ missing — nothing to audit')
        process.exitCode = 0
        return
    }

    const files = walk(packagesRoot)
    const violations = []

    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8')
        const rel = path.relative(root, file).replaceAll('\\', '/')
        for (const rule of FORBIDDEN) {
            if (rule.id === 'useI18n(' && isI18nAdapterFile(file)) continue
            if (!rule.re.test(text)) continue
            // Reset lastIndex for global-less patterns; recreate match for line nums
            const lineRe = new RegExp(rule.re.source, 'g')
            let m
            while ((m = lineRe.exec(text)) !== null) {
                const line = text.slice(0, m.index).split('\n').length
                violations.push({rel, line, rule: rule.id})
            }
        }
    }

    if (violations.length === 0) {
        console.log(`audit-packages-boundary: OK (${files.length} files)`)
        process.exitCode = 0
        return
    }

    console.error('audit-packages-boundary: FAIL — packages/ boundary violations:\n')
    for (const v of violations) {
        console.error(`  ${v.rel}:${v.line}  forbidden ${v.rule}`)
    }
    console.error(`\n${violations.length} violation(s). See docs/UI_FRAMEWORK.md §2.`)
    process.exitCode = 1
}

main()
