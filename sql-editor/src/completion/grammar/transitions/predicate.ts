import type {SqlCompletionSlot} from '@sql-editor/types'
import {sqlScanModeAt} from '../../sql-scan'

/** 谓词右值：引号字面量 / 标识符 / 数字 */
const LITERAL_VALUE_SRC =
    "(?:'(?:[^']|'')*'|\"(?:[^\"]|\"\")*\"|[\\w$]+(?:\\.[\\w$]+)?|\\d+(?:\\.\\d+)?)"
const COLUMN_SRC = '(?:[\\w$]+\\.)?[\\w$]+'
/** 左值：列或简单函数调用 COUNT(*) / SUM(x) */
const PREDICATE_LHS_SRC = `(?:${COLUMN_SRC}|[\\w$]+\\s*\\([^)]*\\))`
const CMP_SRC = '(?:=|<>|!=|>=|<=|<|>)'
const CMP_PREDICATE_SRC = `${PREDICATE_LHS_SRC}\\s*${CMP_SRC}\\s*${LITERAL_VALUE_SRC}`
const LIKE_PREDICATE_SRC = `${PREDICATE_LHS_SRC}\\s+(?:NOT\\s+)?(?:LIKE|ILIKE)\\s+${LITERAL_VALUE_SRC}`
const IN_PREDICATE_SRC = `${PREDICATE_LHS_SRC}\\s+(?:NOT\\s+)?IN\\s*\\([^)]*\\)`
const BETWEEN_PREDICATE_SRC =
    `${PREDICATE_LHS_SRC}\\s+(?:NOT\\s+)?BETWEEN\\s+${LITERAL_VALUE_SRC}\\s+AND\\s+${LITERAL_VALUE_SRC}`
const IS_NULL_PREDICATE_SRC = `${PREDICATE_LHS_SRC}\\s+IS\\s+(?:NOT\\s+)?NULL`
/** WHERE/HAVING 完整谓词原子（可 AND/OR 串联） */
const PREDICATE_ATOM_SRC = `(?:${CMP_PREDICATE_SRC}|${LIKE_PREDICATE_SRC}|${IN_PREDICATE_SRC}|${BETWEEN_PREDICATE_SRC}|${IS_NULL_PREDICATE_SRC})`

function stripTrailingKeywordPrefix(tail: string): string {
    const m = /\s+([A-Za-z_][\w$]*)$/.exec(tail)
    if (!m) return tail.trimEnd()
    const word = m[1].toUpperCase()
    // 完整谓词尾 / 连接词：不要剥掉（否则 IS NOT NULL 会被剥成 IS NOT）
    if (word === 'NULL' || word === 'TRUE' || word === 'FALSE' || word === 'UNKNOWN') {
        return tail.trimEnd()
    }
    return tail.slice(0, m.index).trimEnd()
}

/**
 * ON 右值须为字面量 / 数字 / 限定列（alias.col）。
 * 裸标识符（`= pr`）不算完成，否则会跳进下一子句、丢掉对面表列提示。
 */
const ON_CMP_RHS_SRC =
    "(?:'(?:[^']|'')*'|\"(?:[^\"]|\"\")*\"|[\\w$]+\\.[\\w$]+|\\d+(?:\\.\\d+)?)"
const ON_CMP_PREDICATE_SRC = `${PREDICATE_LHS_SRC}\\s*${CMP_SRC}\\s*${ON_CMP_RHS_SRC}`

/** ON 等值链（右值不含裸标识符） */
function endsWithCompleteOnCmpChain(tail: string): boolean {
    const stripped = stripTrailingKeywordPrefix(tail)
    if (!stripped) return false
    const re = new RegExp(
        `\\bON\\s+${ON_CMP_PREDICATE_SRC}(?:\\s+(?:AND|OR)\\s+${ON_CMP_PREDICATE_SRC})*\\s*$`,
        'i',
    )
    return re.test(stripped)
}

/** WHERE/HAVING 等值链（允许裸标识符作右值，兼容无引号枚举前缀剥离） */
function endsWithCompleteCmpChain(tail: string, clauseKeyword: string): boolean {
    const stripped = stripTrailingKeywordPrefix(tail)
    if (!stripped) return false
    const re = new RegExp(
        `\\b${clauseKeyword}\\s+${CMP_PREDICATE_SRC}(?:\\s+(?:AND|OR)\\s+${CMP_PREDICATE_SRC})*\\s*$`,
        'i',
    )
    return re.test(stripped)
}

/**
 * 比较运算符后已开始输入右值但尚未完成（`= pr` / `LIKE pa` / `IS N`）。
 * 与「停在运算符后空格」同属填值阶段，避免过早进入 clause-next。
 */
export function segmentHasIncompletePredicateRhs(segment: string): boolean {
    const tail = segment.trimEnd()
    if (/[\w$.)]\s*(=|<>|!=|>=|<=|<|>)\s+[A-Za-z_][\w$]*$/i.test(tail)) return true
    if (/\b(?:NOT\s+)?(?:LIKE|ILIKE)\s+[A-Za-z_][\w$]*$/i.test(tail)) return true
    if (/\bIS\s+(?:NOT\s+)?[A-Za-z_][\w$]*$/i.test(tail) && !/\bIS\s+(?:NOT\s+)?NULL\b/i.test(tail)) {
        return true
    }
    return false
}

/** WHERE/HAVING：比较 / LIKE / IN / BETWEEN / IS NULL */
function endsWithCompletePredicateChain(tail: string, clauseKeyword: string): boolean {
    const stripped = stripTrailingKeywordPrefix(tail)
    if (!stripped) return false
    const re = new RegExp(
        `\\b${clauseKeyword}\\s+${PREDICATE_ATOM_SRC}(?:\\s+(?:AND|OR)\\s+${PREDICATE_ATOM_SRC})*\\s*$`,
        'i',
    )
    return re.test(stripped)
}

/** 忽略字符串字面量后，括号是否仍未闭合（IN / EXISTS / 函数参数） */
function hasUnclosedParen(tail: string): boolean {
    let depth = 0
    let inSingle = false
    let inDouble = false
    for (let i = 0; i < tail.length; i++) {
        const ch = tail[i]
        if (inSingle) {
            if (ch === "'" && tail[i + 1] === "'") {
                i++
                continue
            }
            if (ch === "'") inSingle = false
            continue
        }
        if (inDouble) {
            if (ch === '"' && tail[i + 1] === '"') {
                i++
                continue
            }
            if (ch === '"') inDouble = false
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
        if (ch === '(') depth++
        else if (ch === ')') depth = Math.max(0, depth - 1)
    }
    return depth > 0
}

/**
 * 光标仍停在「运算符后、值未完成」——此时不应进入 clause-next。
 * 注意：完整的 `IN (...)` / `LIKE 'x'` / `BETWEEN a AND b` 不得判为 true。
 */
export function segmentEndsWithOperator(segment: string): boolean {
    const tail = segment.trimEnd()
    if (/[\w$.)]\s*(=|<>|!=|>=|<=|<|>)\s*$/i.test(tail)) return true
    if (/\bIS\s+(?:NOT\s+)?$/i.test(tail)) return true
    if (/\b(?:NOT\s+)?(?:LIKE|ILIKE|IN|BETWEEN|EXISTS)\s*$/i.test(tail)) return true
    // IN / EXISTS / 函数：括号未闭合
    if (hasUnclosedParen(tail)) return true
    // BETWEEN 写到一半（右界缺失）
    if (new RegExp(`\\b(?:NOT\\s+)?BETWEEN\\s+${LITERAL_VALUE_SRC}\\s+AND\\s*$`, 'i').test(tail)) {
        return true
    }
    if (new RegExp(`\\b(?:NOT\\s+)?BETWEEN\\s+${LITERAL_VALUE_SRC}\\s*$`, 'i').test(tail)) {
        return true
    }
    // LIKE / ILIKE 引号未闭合
    if (/\b(?:NOT\s+)?(?:LIKE|ILIKE)\s+'(?:[^']|'')*$/i.test(tail)) return true
    if (/\b(?:NOT\s+)?(?:LIKE|ILIKE)\s+"[^"]*$/i.test(tail)) return true
    return false
}

/**
 * ON 子句已出现比较/谓词运算符（含右侧正在输入）。
 * 此时不应再推整句 FK 条件，否则会把已写的 LHS 叠成 `a = a = b`。
 */
export function onClauseHasComparisonOperator(segment: string): boolean {
    const match = /\bON\b([\s\S]*)$/i.exec(segment)
    if (!match?.[1]) return false
    return /(=|<>|!=|>=|<=|<|>|\b(?:NOT\s+)?(?:LIKE|ILIKE|IN|BETWEEN)\b|\bIS\b)/i.test(match[1])
}

/** ON 条件已完整，或正在输入下一子句 / AND/OR 前缀 */
export function detectAfterCompleteOnPredicate(segment: string, slot: SqlCompletionSlot): boolean {
    if (slot !== 'on') return false
    const tail = segment.trimEnd()
    if (segmentEndsWithOperator(tail)) return false
    if (segmentHasIncompletePredicateRhs(tail)) return false
    if (/\b(AND|OR)\s*$/i.test(tail)) return false
    return endsWithCompleteOnCmpChain(tail)
}

/** WHERE/HAVING 条件已完整，或正在输入 AND/OR / GROUP BY 等前缀 */
export function detectAfterCompleteWherePredicate(segment: string, slot: SqlCompletionSlot): boolean {
    if (slot !== 'where' && slot !== 'having') return false
    const tail = segment.trimEnd()
    if (segmentEndsWithOperator(tail)) return false
    if (segmentHasIncompletePredicateRhs(tail)) return false
    if (/\b(AND|OR)\s*$/i.test(tail)) return false
    const clause = slot === 'having' ? 'HAVING' : 'WHERE'
    return endsWithCompletePredicateChain(tail, clause)
}

/**
 * 光标刚越过语句结束分号（行尾空白）时，用分号前的片段做槽位与谓词判断。
 */
export function completionSegmentAtOffset(
    sql: string,
    offset: number,
    bounds: { start: number; end: number },
): { segment: string; offsetInSegment: number; afterStatementSemicolon: boolean } {
    const offsetInSegment = offset - bounds.start
    const segment = sql.slice(bounds.start, offset)

    if (segment.trim() !== '' || bounds.start <= 0) {
        return {segment, offsetInSegment, afterStatementSemicolon: false}
    }

    const semicolonIndex = bounds.start - 1
    if (sql[semicolonIndex] !== ';' || sqlScanModeAt(sql, semicolonIndex) !== 'code') {
        return {segment, offsetInSegment, afterStatementSemicolon: false}
    }

    let prevStart = 0
    for (let i = 0; i < semicolonIndex; i++) {
        if (sql[i] === ';' && sqlScanModeAt(sql, i) === 'code') prevStart = i + 1
    }

    const prevSegment = sql.slice(prevStart, semicolonIndex)
    return {
        segment: prevSegment,
        offsetInSegment: prevSegment.length,
        afterStatementSemicolon: true,
    }
}
