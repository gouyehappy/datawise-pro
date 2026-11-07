import type {CaretPosition} from 'dt-sql-parser'

/** 字符 offset → parser CaretPosition（1-based 行列） */
export function caretFromOffset(sql: string, offset: number): CaretPosition {
    const safe = Math.max(0, Math.min(offset, sql.length))
    const before = sql.slice(0, safe)
    const lineNumber = before.split('\n').length
    const lastLine = before.slice(before.lastIndexOf('\n') + 1)
    return {lineNumber, column: lastLine.length + 1}
}
