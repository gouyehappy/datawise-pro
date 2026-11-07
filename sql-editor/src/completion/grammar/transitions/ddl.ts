import {maskNonCodeRegionsCached} from '../../incremental-scan'
import {codeParenDepthAt, lastKeywordEndInCode} from '../../sql-scan'

const ALTER_COLUMN_TYPE_TAIL =
    /\b(?:ADD|MODIFY|CHANGE|ALTER)\s+COLUMN\s+[\w$"'`[\]]+(?:\s+[\w$]*)?\s*$/i

function lastMarkerIndex(masked: string, keyword: string): number {
    return lastKeywordEndInCode(masked, keyword)
}

function createTableMarkerIndex(masked: string): number {
    return Math.max(
        lastMarkerIndex(masked, 'CREATE TABLE IF NOT EXISTS'),
        lastMarkerIndex(masked, 'CREATE TABLE'),
    )
}

function createTableColumnFragment(fromParen: string): string {
    const tail = fromParen.startsWith('(') ? fromParen.slice(1) : fromParen
    return tail.includes(',') ? tail.slice(tail.lastIndexOf(',') + 1) : tail
}

function isCreateTableColumnTypePosition(fromParen: string): boolean {
    const current = createTableColumnFragment(fromParen)
    return /^\s*[\w$"'`[\]]+\s+(?:[\w$]*)?\s*$/.test(current)
}

const IDENT = '[`"\'\\[]?[\\w$]+[`"\'\\]]?'

/** ALTER TABLE <table> 之后：等待 ADD/DROP/MODIFY…（尚未写入动作关键字） */
export function detectDdlAfterAlterTable(segment: string): boolean {
    const re = new RegExp(
        String.raw`\bALTER\s+TABLE\s+(?:${IDENT}\s*\.\s*)*${IDENT}\s+$`,
        'i',
    )
    return re.test(segment)
}

/** ALTER … ADD/MODIFY/CHANGE COLUMN 列名之后，或 CREATE TABLE (…) 内列名之后 */
export function detectDdlAwaitingColumnType(segment: string): boolean {
    if (ALTER_COLUMN_TYPE_TAIL.test(segment)) return true

    const masked = maskNonCodeRegionsCached(segment)
    const createIdx = createTableMarkerIndex(masked)
    if (createIdx < 0) return false

    const afterCreate = segment.slice(createIdx)
    const maskedAfter = masked.slice(createIdx)
    const parenIdx = maskedAfter.indexOf('(')
    if (parenIdx < 0) return false

    const fromParen = afterCreate.slice(parenIdx)
    const depth = codeParenDepthAt(fromParen, fromParen.length)
    if (depth <= 0) return false

    return isCreateTableColumnTypePosition(fromParen)
}
