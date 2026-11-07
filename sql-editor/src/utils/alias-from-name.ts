/**
 * 从表名生成补全用别名（纯函数，无 Monaco / Vue 依赖）。
 */
const RESERVED = new Set([
    'inner', 'left', 'right', 'full', 'cross', 'join', 'on', 'where', 'group', 'order', 'by',
    'having', 'limit', 'union', 'select', 'from', 'as', 'and', 'or', 'using', 'natural', 'not',
    'in', 'is', 'null', 'like', 'between', 'exists', 'case', 'when', 'then', 'else', 'end',
])

/** 去掉 schema / 引号，取裸表名 */
export function tableBaseName(qualified: string): string {
    let name = qualified.trim()
    if ((name.startsWith('`') && name.endsWith('`')) || (name.startsWith('"') && name.endsWith('"'))) {
        name = name.slice(1, -1)
    }
    const dot = name.lastIndexOf('.')
    return (dot >= 0 ? name.slice(dot + 1) : name).toLowerCase()
}

/** snake_case / camelCase → 单词数组 */
export function splitTableWords(name: string): string[] {
    const base = tableBaseName(name)
    if (!base) return []

    if (base.includes('_')) {
        return base.split('_').filter((w) => w.length > 0)
    }

    const camel = base.match(/[A-Z]?[a-z]+|[A-Z]+(?=[A-Z][a-z]|\d|\W|$)|\d+/g)
    if (camel?.length) return camel.map((w) => w.toLowerCase())
    return [base]
}

function isValidAlias(alias: string): boolean {
    return /^[a-z][a-z0-9_]*$/i.test(alias) && !RESERVED.has(alias.toLowerCase())
}

/** 按表名单词结构生成首选缩写 */
export function primaryAliasFromWords(words: string[]): string {
    if (!words.length) return 'tb'
    if (words.length === 1) {
        const w = words[0]
        return w.slice(0, Math.min(3, w.length))
    }
    if (words.length === 2) {
        return `${words[0][0]}${words[1][0]}`
    }
    return words
        .slice(0, 3)
        .map((w) => w[0])
        .join('')
}

/** 冲突时依次尝试的候选别名（确定性，非随机） */
export function aliasCandidatesForTable(table: string): string[] {
    const words = splitTableWords(table)
    const out: string[] = []

    if (words.length === 1) {
        const w = words[0]
        for (let n = 2; n <= Math.min(4, w.length); n++) out.push(w.slice(0, n))
    } else if (words.length === 2) {
        const [a, b] = words
        out.push(`${a[0]}${b[0]}`)
        out.push(`${a.slice(0, 2)}${b[0]}`)
        out.push(`${a[0]}${b.slice(0, 2)}`)
        out.push(`${a.slice(0, 2)}${b.slice(0, 2)}`)
        for (let n = 3; n <= Math.min(a.length, 4); n++) out.push(`${a.slice(0, n)}${b[0]}`)
        out.push(`${a[0]}${b}`)
    } else {
        out.push(primaryAliasFromWords(words))
        out.push(words.map((w) => w[0]).join(''))
        const flat = words.join('')
        for (let n = 2; n <= Math.min(4, flat.length); n++) out.push(flat.slice(0, n))
    }

    const primary = out[0] ?? primaryAliasFromWords(words)
    for (let i = 2; i <= 99; i++) out.push(`${primary}${i}`)

    return [...new Set(out.filter((a) => a.length > 0))]
}

/** 在已占用集合内为表名挑选唯一别名 */
export function suggestTableAlias(table: string, used: ReadonlySet<string>): string {
    for (const candidate of aliasCandidatesForTable(table)) {
        const alias = candidate.toLowerCase()
        if (isValidAlias(candidate) && !used.has(alias)) return candidate
    }
    return 'tb99'
}
