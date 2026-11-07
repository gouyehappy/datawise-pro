import type {SqlEditorSchema} from '@sql-editor/types'
import {collectUsedAliases, nextTableAlias, preferredAlias} from '@sql-editor/utils/alias'
import {fkJoinConditions, relatedTablesForJoin} from '@sql-editor/utils/schema-columns'

export interface FkJoinLineCandidate {
    targetTable: string
    sourceTable: string
    condition: string
    sourceAlias: string
    targetAlias: string
}

/** 基于当前已引用表，生成可一键插入的 FK JOIN 行候选 */
export function fkJoinLineCandidates(
    schema: SqlEditorSchema,
    inQuery: string[],
    aliases: Record<string, string>,
    sql: string,
    currentLine: string,
    cursorOffset?: number,
): FkJoinLineCandidate[] {
    if (!inQuery.length) return []

    const inSet = new Set(inQuery.map((t) => t.toLowerCase()))
    const related = relatedTablesForJoin(schema, inQuery)
    const results: FkJoinLineCandidate[] = []
    const seen = new Set<string>()

    const used = collectUsedAliases(aliases, sql, currentLine, cursorOffset)

    for (const targetTable of related) {
        const targetKey = targetTable.toLowerCase()
        if (inSet.has(targetKey)) continue

        for (const sourceTable of inQuery) {
            const sourceAlias = preferredAlias(sourceTable, aliases)
            const targetAlias = nextTableAlias(targetTable, aliases, sql, currentLine, used, cursorOffset)
            used.add(targetAlias.toLowerCase())
            const conditions = fkJoinConditions(
                schema,
                sourceTable,
                sourceAlias,
                targetTable,
                targetAlias,
            )
            for (const condition of conditions) {
                const dedupe = `${targetKey}:${condition}`.toLowerCase()
                if (seen.has(dedupe)) continue
                seen.add(dedupe)
                results.push({
                    targetTable,
                    sourceTable,
                    condition,
                    sourceAlias,
                    targetAlias,
                })
            }
        }
    }

    return results.sort(
        (a, b) => a.targetTable.localeCompare(b.targetTable) || a.condition.localeCompare(b.condition),
    )
}

export function buildInnerJoinLine(candidate: FkJoinLineCandidate): string {
    return `INNER JOIN ${candidate.targetTable} ${candidate.targetAlias} ON ${candidate.condition}`
}

export function buildLeftJoinLine(candidate: FkJoinLineCandidate): string {
    return `LEFT JOIN ${candidate.targetTable} ${candidate.targetAlias} ON ${candidate.condition}`
}

/** 带前导换行的 JOIN 行（行首时由 adjustKeywordInsertNewlines 剥掉） */
export function buildInnerJoinLineInsert(candidate: FkJoinLineCandidate): string {
    return `\n${buildInnerJoinLine(candidate)}`
}

export function buildLeftJoinLineInsert(candidate: FkJoinLineCandidate): string {
    return `\n${buildLeftJoinLine(candidate)}`
}

/**
 * 空前缀全出；表名前缀 / join·fk·lj·ij 等也能命中，提升一键 JOIN 可发现性。
 */
export function matchesFkJoinLinePrefix(
    candidate: FkJoinLineCandidate,
    prefix: string,
    kind: 'inner' | 'left',
): boolean {
    const p = prefix.trim().toLowerCase()
    if (!p) return true
    if (candidate.targetTable.toLowerCase().startsWith(p)) return true
    if (candidate.sourceTable.toLowerCase().startsWith(p)) return true
    // 短前缀易误伤条件串；≥2 才按条件子串匹配
    if (p.length >= 2 && candidate.condition.toLowerCase().includes(p)) return true

    const tokens =
        kind === 'left'
            ? ['left join', 'leftj', 'left', 'lj', 'join', 'fk']
            : ['inner join', 'inner', 'ij', 'join', 'fk']
    return tokens.some((token) => token.startsWith(p) || p.startsWith(token))
}
