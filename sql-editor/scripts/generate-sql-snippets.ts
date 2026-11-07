/**
 * 从 constants/snippets.ts 生成内置 sql-snippets.shared.json
 * 运行: npm run gen:snippets
 */
import {writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {SQL_SNIPPETS, SQL_SLOT_SNIPPETS} from '../src/constants/snippets.ts'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const target = resolve(root, 'src/config/sql-snippets.shared.json')

const snippets = []

for (const snippet of SQL_SNIPPETS) {
    snippets.push({
        id: `global.${snippet.label}`,
        label: snippet.label,
        insertText: snippet.insertText,
        detail: snippet.detail ?? '',
        enabled: true,
        slots: ['statement_start'],
        builtin: true,
    })
}

for (const [slot, list] of Object.entries(SQL_SLOT_SNIPPETS)) {
    for (const snippet of list ?? []) {
        snippets.push({
            id: `${slot}.${snippet.label}`,
            label: snippet.label,
            insertText: snippet.insertText,
            detail: snippet.detail ?? '',
            enabled: true,
            slots: [slot],
            builtin: true,
        })
    }
}

const payload = {
    autoTableAlias: true,
    snippets,
}

writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(`Wrote ${target} (${payload.snippets.length} snippets)`)
