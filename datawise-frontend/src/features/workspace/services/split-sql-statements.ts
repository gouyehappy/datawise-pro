/** 判断分号是否处于可执行代码区域（非字符串/注释） */
function isSemicolonInCode(sql: string, index: number): boolean {
    let inSingle = false
    let inDouble = false
    let inBacktick = false
    let inLineComment = false
    let inBlockComment = false

    for (let i = 0; i < index; i++) {
        const ch = sql[i]
        const next = sql[i + 1]

        if (inLineComment) {
            if (ch === '\n') inLineComment = false
            continue
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false
                i++
            }
            continue
        }
        if (inSingle) {
            if (ch === "'" && sql[i - 1] !== '\\') inSingle = false
            continue
        }
        if (inDouble) {
            if (ch === '"' && sql[i - 1] !== '\\') inDouble = false
            continue
        }
        if (inBacktick) {
            if (ch === '`') inBacktick = false
            continue
        }

        if (ch === '-' && next === '-') {
            inLineComment = true
            i++
            continue
        }
        if (ch === '/' && next === '*') {
            inBlockComment = true
            i++
            continue
        }
        if (ch === "'") {
            inSingle = true
            continue
        }
        if (ch === '"') {
            inDouble = true
            continue
        }
        if (ch === '`') {
            inBacktick = true
        }
    }

    return !inSingle && !inDouble && !inBacktick && !inLineComment && !inBlockComment
}

/** 按分号拆分可执行 SQL（忽略字符串与注释内的分号） */
export function splitSqlStatements(sql: string): string[] {
    const statements: string[] = []
    let start = 0

    for (let i = 0; i < sql.length; i++) {
        if (sql[i] !== ';') continue
        if (!isSemicolonInCode(sql, i)) continue

        const piece = sql.slice(start, i).trim()
        if (piece) statements.push(piece)
        start = i + 1
    }

    const tail = sql.slice(start).trim()
    if (tail) statements.push(tail)

    return statements
}
