/** 判断分号是否处于可执行代码区域（非字符串/注释） */
export function isSemicolonInCode(sql: string, index: number): boolean {
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
