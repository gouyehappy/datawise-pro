import type {SqlLogEntry} from '@/core/types'
import type {TableForeignKeyDetail, TableRelationEdge, TableRelationsResult} from '@/shared/api/types'

export type LightLineageConfidence = 'certain' | 'possible'
export type LightLineageDirection = 'upstream' | 'downstream'
export type LightLineageSource = 'fk' | 'view' | 'history'

export interface LightLineageEdge {
    direction: LightLineageDirection
    peerTable: string
    peerColumn: string
    confidence: LightLineageConfidence
    source: LightLineageSource
    /** Constraint name, view, or truncated SQL hint */
    detail?: string
}

export interface LightLineageSummary {
    column: string
    upstream: LightLineageEdge[]
    downstream: LightLineageEdge[]
}

export function normalizeIdent(value: string): string {
    return value
        .trim()
        .replace(/^\[([^\]]+)\]$/, '$1')
        .replace(/^"([^"]+)"$/, '$1')
        .replace(/^`([^`]+)`$/, '$1')
        .toLowerCase()
}

export function splitColumnList(raw: string | undefined | null): string[] {
    if (!raw?.trim()) return []
    return raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
}

function edgeKey(edge: LightLineageEdge): string {
    return [
        edge.direction,
        normalizeIdent(edge.peerTable),
        normalizeIdent(edge.peerColumn),
        edge.confidence,
        edge.source,
    ].join('|')
}

function pushUnique(target: LightLineageEdge[], edge: LightLineageEdge) {
    if (target.some((item) => edgeKey(item) === edgeKey(edge))) return
    target.push(edge)
}

function tableSuffix(qualified: string): string {
    const parts = qualified.split('.').map((part) => part.trim()).filter(Boolean)
    return parts[parts.length - 1] ?? qualified
}

function parseQualifiedColumn(raw: string): {table?: string; column: string} | null {
    const cleaned = raw.trim().replace(/\s+/g, '')
    if (!cleaned) return null
    const parts = cleaned.split('.').filter(Boolean)
    if (parts.length === 1) return {column: parts[0]!}
    if (parts.length >= 2) {
        return {
            table: parts[parts.length - 2],
            column: parts[parts.length - 1]!,
        }
    }
    return null
}

function collectFkEdges(
    column: string,
    foreignKeys: readonly TableForeignKeyDetail[],
    relations: TableRelationsResult | null | undefined,
): LightLineageEdge[] {
    const edges: LightLineageEdge[] = []
    const col = normalizeIdent(column)

    for (const fk of foreignKeys) {
        const local = splitColumnList(fk.columns)
        const remote = splitColumnList(fk.referenceColumns)
        const index = local.findIndex((name) => normalizeIdent(name) === col)
        if (index < 0) continue
        const peerColumn = remote[index]
        if (!peerColumn) continue
        pushUnique(edges, {
            direction: 'upstream',
            peerTable: tableSuffix(fk.referenceTable),
            peerColumn,
            confidence: 'certain',
            source: 'fk',
            detail: fk.name,
        })
    }

    if (!relations) return edges

    for (const edge of relations.references) {
        collectRelationEdge(edges, column, edge, 'upstream')
    }
    for (const edge of relations.referencedBy) {
        collectRelationEdge(edges, column, edge, 'downstream')
    }
    return edges
}

function collectRelationEdge(
    edges: LightLineageEdge[],
    column: string,
    edge: TableRelationEdge,
    direction: LightLineageDirection,
) {
    const col = normalizeIdent(column)
    if (direction === 'upstream') {
        const local = splitColumnList(edge.sourceColumns)
        const remote = splitColumnList(edge.targetColumns)
        const index = local.findIndex((name) => normalizeIdent(name) === col)
        if (index < 0) return
        const peerColumn = remote[index]
        if (!peerColumn) return
        pushUnique(edges, {
            direction: 'upstream',
            peerTable: tableSuffix(edge.targetTable),
            peerColumn,
            confidence: 'certain',
            source: 'fk',
            detail: edge.constraintName,
        })
        return
    }

    const local = splitColumnList(edge.targetColumns)
    const remote = splitColumnList(edge.sourceColumns)
    const index = local.findIndex((name) => normalizeIdent(name) === col)
    if (index < 0) return
    const peerColumn = remote[index]
    if (!peerColumn) return
    pushUnique(edges, {
        direction: 'downstream',
        peerTable: tableSuffix(edge.sourceTable),
        peerColumn,
        confidence: 'certain',
        source: 'fk',
        detail: edge.constraintName,
    })
}

function buildAliasMap(ddl: string): Map<string, string> {
    const map = new Map<string, string>()
    const re = /\b(?:from|join)\s+([^\s,;]+)\s+(?:as\s+)?([`"[\]]?[A-Za-z_]\w*[`"[\]]?)/gi
    let match: RegExpExecArray | null
    while ((match = re.exec(ddl)) !== null) {
        const tableRaw = match[1]
        const aliasRaw = match[2]
        if (!tableRaw || !aliasRaw) continue
        if (/^(inner|left|right|full|cross|outer|join|on|where|group|order|limit|fetch|union)$/i.test(aliasRaw)) {
            continue
        }
        map.set(normalizeIdent(aliasRaw), tableSuffix(tableRaw))
    }
    return map
}

function resolvePeerTable(rawTable: string, aliasMap: Map<string, string>): string {
    const suffix = tableSuffix(rawTable)
    return aliasMap.get(normalizeIdent(suffix)) ?? suffix
}

/** Best-effort: map view output column aliases back to source table.column. */
export function inferViewColumnSources(ddl: string, viewColumn: string): LightLineageEdge[] {
    const edges: LightLineageEdge[] = []
    const col = normalizeIdent(viewColumn)
    const aliasMap = buildAliasMap(ddl)
    const asMatch = [...ddl.matchAll(
        /((?:[\w`"[\].]+)\s*\.\s*(?:[\w`"[\]]+))\s+(?:as\s+)?([`"[\]]?[\w]+[`"[\]]?)/gi,
    )]
    for (const match of asMatch) {
        const sourceRaw = match[1]
        const aliasRaw = match[2]
        if (!sourceRaw || !aliasRaw) continue
        if (normalizeIdent(aliasRaw) !== col) continue
        const parsed = parseQualifiedColumn(sourceRaw)
        if (!parsed?.table) continue
        pushUnique(edges, {
            direction: 'upstream',
            peerTable: resolvePeerTable(parsed.table, aliasMap),
            peerColumn: parsed.column,
            confidence: 'certain',
            source: 'view',
            detail: 'view',
        })
    }

    // Unaliased select list item: SELECT t.col FROM …
    const selectBody = ddl.match(/select\s+([\s\S]+?)\s+from\s+/i)?.[1]
    if (selectBody) {
        for (const part of selectBody.split(',')) {
            const token = part.trim()
            if (/\bas\b/i.test(token)) continue
            const parsed = parseQualifiedColumn(token)
            if (!parsed?.table) continue
            if (normalizeIdent(parsed.column) !== col) continue
            pushUnique(edges, {
                direction: 'upstream',
                peerTable: resolvePeerTable(parsed.table, aliasMap),
                peerColumn: parsed.column,
                confidence: 'possible',
                source: 'view',
                detail: 'view',
            })
        }
    }
    return edges
}

export function inferHistoryJoinPeers(
    tableName: string,
    column: string,
    logs: readonly SqlLogEntry[],
    limit = 40,
): LightLineageEdge[] {
    const edges: LightLineageEdge[] = []
    const table = normalizeIdent(tableSuffix(tableName))
    const col = normalizeIdent(column)
    const joinOnRe = /\bon\s+([^\s=]+)\s*=\s*([^\s]+)/gi

    for (const log of logs.slice(0, limit)) {
        const sql = log.sql
        if (!sql?.trim()) continue
        const aliasMap = buildAliasMap(sql)
        joinOnRe.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = joinOnRe.exec(sql)) !== null) {
            const left = parseQualifiedColumn(match[1] ?? '')
            const right = parseQualifiedColumn(match[2] ?? '')
            if (!left?.table || !right?.table) continue
            const leftTable = normalizeIdent(resolvePeerTable(left.table, aliasMap))
            const rightTable = normalizeIdent(resolvePeerTable(right.table, aliasMap))
            const leftCol = normalizeIdent(left.column)
            const rightCol = normalizeIdent(right.column)

            if (leftTable === table && leftCol === col) {
                pushUnique(edges, {
                    direction: 'upstream',
                    peerTable: resolvePeerTable(right.table, aliasMap),
                    peerColumn: right.column,
                    confidence: 'possible',
                    source: 'history',
                    detail: sql.trim().slice(0, 80),
                })
            } else if (rightTable === table && rightCol === col) {
                pushUnique(edges, {
                    direction: 'upstream',
                    peerTable: resolvePeerTable(left.table, aliasMap),
                    peerColumn: left.column,
                    confidence: 'possible',
                    source: 'history',
                    detail: sql.trim().slice(0, 80),
                })
            }
        }
    }
    return edges
}

export function buildColumnLightLineage(input: {
    tableName: string
    column: string
    foreignKeys?: readonly TableForeignKeyDetail[]
    relations?: TableRelationsResult | null
    viewDdl?: string | null
    sqlLogs?: readonly SqlLogEntry[]
}): LightLineageSummary {
    const edges: LightLineageEdge[] = []
    for (const edge of collectFkEdges(input.column, input.foreignKeys ?? [], input.relations)) {
        pushUnique(edges, edge)
    }
    if (input.viewDdl?.trim()) {
        for (const edge of inferViewColumnSources(input.viewDdl, input.column)) {
            pushUnique(edges, edge)
        }
    }
    if (input.sqlLogs?.length) {
        for (const edge of inferHistoryJoinPeers(input.tableName, input.column, input.sqlLogs)) {
            pushUnique(edges, edge)
        }
    }

    return {
        column: input.column,
        upstream: edges.filter((edge) => edge.direction === 'upstream'),
        downstream: edges.filter((edge) => edge.direction === 'downstream'),
    }
}

export function summarizeLightLineageCounts(summary: LightLineageSummary): {
    upstream: number
    downstream: number
    certain: number
    possible: number
} {
    const all = [...summary.upstream, ...summary.downstream]
    return {
        upstream: summary.upstream.length,
        downstream: summary.downstream.length,
        certain: all.filter((edge) => edge.confidence === 'certain').length,
        possible: all.filter((edge) => edge.confidence === 'possible').length,
    }
}
