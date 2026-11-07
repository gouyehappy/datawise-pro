import {maskNonCodeRegionsCached} from '../../incremental-scan'
import {codeParenDepthAt, lastKeywordEndInCode} from '../../sql-scan'
import {segmentEndsWithOperator} from './predicate'
import type {SqlCompletionSlot} from '@sql-editor/types'

const IDENT = '[`"\'\\[]?[\\w$]+[`"\'\\]]?'

/** INSERT INTO t ( … ) 列清单括号内（尚未 VALUES） */
export function detectInsertInColumnList(segment: string): boolean {
    if (/\bVALUES\b/i.test(segment)) return false
    const masked = maskNonCodeRegionsCached(segment)
    const intoIdx = lastKeywordEndInCode(masked, 'INTO')
    if (intoIdx < 0) return false
    const afterInto = segment.slice(intoIdx)
    const maskedAfter = masked.slice(intoIdx)
    const parenIdx = maskedAfter.indexOf('(')
    if (parenIdx < 0) return false
    const fromParen = afterInto.slice(parenIdx)
    return codeParenDepthAt(fromParen, fromParen.length) > 0
}

/** INSERT INTO t (cols) 列清单已闭合，等待 VALUES */
export function detectAfterInsertColumnList(segment: string): boolean {
    if (/\bVALUES\b/i.test(segment)) return false
    const re = new RegExp(
        String.raw`\bINTO\s+(?:${IDENT}\s*\.\s*)*${IDENT}(?:\s+${IDENT})?\s*\([^)]*\)\s*$`,
        'i',
    )
    return re.test(segment.trimEnd())
}

/** UPDATE SET col = value 赋值写完（下一个可 WHERE / 逗号续写） */
export function detectAfterCompleteSetAssignment(
    segment: string,
    slot: SqlCompletionSlot,
): boolean {
    if (slot !== 'set') return false
    if (segmentEndsWithOperator(segment)) return false
    const tail = segment.trimEnd()
    const re = new RegExp(
        String.raw`(?:^|,|\bSET\b)\s*${IDENT}(?:\s*\.\s*${IDENT})?\s*=\s*(?:NULL|TRUE|FALSE|'[^']*'|"[^"]*"|\d+(?:\.\d+)?|${IDENT}(?:\s*\.\s*${IDENT})?)\s*$`,
        'i',
    )
    return re.test(tail)
}
