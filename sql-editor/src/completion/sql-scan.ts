/**
 * SQL 词法扫描（补全 / 解析共用）。
 * 识别字符串、注释、括号深度，避免在字面量内误触发补全或误判 slot。
 */

export type SqlScanMode =
    | 'code'
    | 'single'
    | 'double'
    | 'backtick'
    | 'bracket'
    | 'dollar'
    | 'lineComment'
    | 'blockComment'

export type DollarState = { tag: string } | null

export type LexerCheckpoint = {
    mode: SqlScanMode
    dollar: DollarState
}

function readDollarTag(sql: string, start: number): { tag: string; end: number } | null {
    if (sql[start] !== '$') return null
    let i = start + 1
    while (i < sql.length && /[A-Za-z0-9_]/.test(sql[i])) i++
    if (sql[i] !== '$') return null
    return {tag: sql.slice(start, i + 1), end: i + 1}
}

/** 从 `from` 扫描至 `limit`（不含），返回 limit 处的词法状态 */
export function scanLexerTo(
    sql: string,
    limit: number,
    from = 0,
    initial: LexerCheckpoint = {mode: 'code', dollar: null},
): LexerCheckpoint & { index: number } {
    const end = Math.max(from, Math.min(limit, sql.length))
    let i = from
    let mode = initial.mode
    let dollar = initial.dollar

    while (i < end) {
        const ch = sql[i]
        const next = sql[i + 1]

        if (mode === 'lineComment') {
            if (ch === '\n') mode = 'code'
            i++
            continue
        }

        if (mode === 'blockComment') {
            if (ch === '*' && next === '/') {
                mode = 'code'
                i += 2
                continue
            }
            i++
            continue
        }

        if (mode === 'dollar' && dollar) {
            if (ch === '$') {
                const closing = readDollarTag(sql, i)
                if (closing && closing.tag === dollar.tag) {
                    mode = 'code'
                    dollar = null
                    i = closing.end
                    continue
                }
            }
            i++
            continue
        }

        if (mode === 'single') {
            if (ch === "'" && next === "'") {
                i += 2
                continue
            }
            if (ch === "'") {
                mode = 'code'
                i++
                continue
            }
            i++
            continue
        }

        if (mode === 'double') {
            if (ch === '"' && next === '"') {
                i += 2
                continue
            }
            if (ch === '"') {
                mode = 'code'
                i++
                continue
            }
            i++
            continue
        }

        if (mode === 'backtick') {
            if (ch === '`' && next === '`') {
                i += 2
                continue
            }
            if (ch === '`') {
                mode = 'code'
                i++
                continue
            }
            i++
            continue
        }

        if (mode === 'bracket') {
            if (ch === ']') {
                mode = 'code'
                i++
                continue
            }
            i++
            continue
        }

        if (ch === '-' && next === '-') {
            mode = 'lineComment'
            i += 2
            continue
        }
        if (ch === '/' && next === '*') {
            mode = 'blockComment'
            i += 2
            continue
        }
        if (ch === '#') {
            mode = 'lineComment'
            i++
            continue
        }
        if (ch === '$') {
            const opening = readDollarTag(sql, i)
            if (opening) {
                mode = 'dollar'
                dollar = {tag: opening.tag}
                i = opening.end
                continue
            }
        }
        if (ch === "'") {
            mode = 'single'
            i++
            continue
        }
        if (ch === '"') {
            mode = 'double'
            i++
            continue
        }
        if (ch === '`') {
            mode = 'backtick'
            i++
            continue
        }
        if (ch === '[') {
            mode = 'bracket'
            i++
            continue
        }
        i++
    }

    return {mode, dollar, index: i}
}

/**
 * 扫描至 `offset` 前的词法状态。
 * @returns 非 `code` 表示光标位于字符串或注释内。
 */
export function sqlScanModeAt(sql: string, offset: number): SqlScanMode {
    return scanLexerTo(sql, offset).mode
}

export function isCursorInStringOrComment(sql: string, offset: number): boolean {
    return sqlScanModeAt(sql, offset) !== 'code'
}

/** 将字符串 / 注释区域替换为空格，保留长度与结构供正则解析。 */
export function maskNonCodeRegions(sql: string): string {
    const limit = sql.length
    if (!limit) return ''
    const chars: string[] = new Array(limit)
    for (let k = 0; k < limit; k++) chars[k] = sql[k]

    let i = 0
    let mode: SqlScanMode = 'code'
    let dollar: DollarState = null

    const blank = (from: number, to: number) => {
        for (let j = from; j < to; j++) {
            if (chars[j] !== '\n' && chars[j] !== '\r') chars[j] = ' '
        }
    }

    while (i < limit) {
        const ch = sql[i]
        const next = sql[i + 1]

        if (mode === 'lineComment') {
            blank(i, i + 1)
            if (ch === '\n') mode = 'code'
            i++
            continue
        }

        if (mode === 'blockComment') {
            blank(i, i + 1)
            if (ch === '*' && next === '/') {
                blank(i + 1, i + 2)
                mode = 'code'
                i += 2
                continue
            }
            i++
            continue
        }

        if (mode === 'dollar' && dollar) {
            if (ch === '$') {
                const closing = readDollarTag(sql, i)
                if (closing && closing.tag === dollar.tag) {
                    blank(i, closing.end)
                    mode = 'code'
                    dollar = null
                    i = closing.end
                    continue
                }
            }
            blank(i, i + 1)
            i++
            continue
        }

        if (mode === 'single' || mode === 'double' || mode === 'backtick' || mode === 'bracket') {
            const close =
                mode === 'single'
                    ? "'"
                    : mode === 'double'
                        ? '"'
                        : mode === 'backtick'
                            ? '`'
                            : ']'
            if (mode !== 'bracket' && ch === close && next === close) {
                blank(i, i + 2)
                i += 2
                continue
            }
            if (ch === close) {
                blank(i, i + 1)
                mode = 'code'
                i++
                continue
            }
            blank(i, i + 1)
            i++
            continue
        }

        if (ch === '-' && next === '-') {
            blank(i, i + 2)
            mode = 'lineComment'
            i += 2
            continue
        }
        if (ch === '/' && next === '*') {
            blank(i, i + 2)
            mode = 'blockComment'
            i += 2
            continue
        }
        if (ch === '#') {
            blank(i, i + 1)
            mode = 'lineComment'
            i++
            continue
        }
        if (ch === '$') {
            const opening = readDollarTag(sql, i)
            if (opening) {
                blank(i, opening.end)
                mode = 'dollar'
                dollar = {tag: opening.tag}
                i = opening.end
                continue
            }
        }
        if (ch === "'") {
            blank(i, i + 1)
            mode = 'single'
            i++
            continue
        }
        if (ch === '"') {
            blank(i, i + 1)
            mode = 'double'
            i++
            continue
        }
        if (ch === '`') {
            blank(i, i + 1)
            mode = 'backtick'
            i++
            continue
        }
        if (ch === '[') {
            blank(i, i + 1)
            mode = 'bracket'
            i++
            continue
        }
        i++
    }

    if (mode !== 'code') blank(0, limit)
    return chars.join('')
}

/** 词法感知的括号深度（忽略字符串 / 注释内的括号）。单次扫描 O(n)。 */
export function codeParenDepthAt(sql: string, offset: number): number {
    const limit = Math.max(0, Math.min(offset, sql.length))
    let depth = 0
    let i = 0
    let mode: SqlScanMode = 'code'
    let dollar: DollarState = null

    while (i < limit) {
        const ch = sql[i]
        const next = sql[i + 1]

        if (mode === 'lineComment') {
            if (ch === '\n') mode = 'code'
            i++
            continue
        }

        if (mode === 'blockComment') {
            if (ch === '*' && next === '/') {
                mode = 'code'
                i += 2
                continue
            }
            i++
            continue
        }

        if (mode === 'dollar' && dollar) {
            if (ch === '$') {
                const closing = readDollarTag(sql, i)
                if (closing && closing.tag === dollar.tag) {
                    mode = 'code'
                    dollar = null
                    i = closing.end
                    continue
                }
            }
            i++
            continue
        }

        if (mode === 'single') {
            if (ch === "'" && next === "'") {
                i += 2
                continue
            }
            if (ch === "'") {
                mode = 'code'
                i++
                continue
            }
            i++
            continue
        }

        if (mode === 'double') {
            if (ch === '"' && next === '"') {
                i += 2
                continue
            }
            if (ch === '"') {
                mode = 'code'
                i++
                continue
            }
            i++
            continue
        }

        if (mode === 'backtick') {
            if (ch === '`' && next === '`') {
                i += 2
                continue
            }
            if (ch === '`') {
                mode = 'code'
                i++
                continue
            }
            i++
            continue
        }

        if (mode === 'bracket') {
            if (ch === ']') {
                mode = 'code'
                i++
                continue
            }
            i++
            continue
        }

        if (ch === '(') depth++
        else if (ch === ')') depth = Math.max(0, depth - 1)

        if (ch === '-' && next === '-') {
            mode = 'lineComment'
            i += 2
            continue
        }
        if (ch === '/' && next === '*') {
            mode = 'blockComment'
            i += 2
            continue
        }
        if (ch === '#') {
            mode = 'lineComment'
            i++
            continue
        }
        if (ch === '$') {
            const opening = readDollarTag(sql, i)
            if (opening) {
                mode = 'dollar'
                dollar = {tag: opening.tag}
                i = opening.end
                continue
            }
        }
        if (ch === "'") {
            mode = 'single'
            i++
            continue
        }
        if (ch === '"') {
            mode = 'double'
            i++
            continue
        }
        if (ch === '`') {
            mode = 'backtick'
            i++
            continue
        }
        if (ch === '[') {
            mode = 'bracket'
            i++
            continue
        }
        i++
    }

    return depth
}

/**
 * 在 masked 文本中查找 keyword 最后一次出现位置（返回 keyword 结束下标）。
 * masked 须由 maskNonCodeRegions 生成。
 */
export function lastKeywordEndInCode(masked: string, keyword: string): number {
    const re = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'gi')
    let last = -1
    let match: RegExpExecArray | null
    while ((match = re.exec(masked)) !== null) {
        last = match.index + match[0].length
    }
    return last
}
