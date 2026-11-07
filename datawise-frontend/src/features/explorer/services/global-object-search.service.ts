import type {DbType, TreeNode, TreeNodeType} from '@/core/types'
import {walkTree} from '@/core/utils/tree'
import {isCatalogSchemaDbType} from '@/shared/db-type-families'
import {appendPinyinSearchKeys, toPinyinInitials} from '@/features/layout/services/pinyin-match.service'

export type GlobalObjectSearchKind = 'table' | 'view' | 'column' | 'procedure' | 'function' | 'metric'

export interface GlobalObjectSearchEntry {
    nodeId: string
    kind: GlobalObjectSearchKind
    name: string
    qualifiedLabel: string
    connectionId: string
    connectionLabel: string
    database: string
    dbType?: DbType
    tableName?: string
    owner?: string
    subtitle?: string
    /** Local explorer index vs org discovery API */
    source?: 'explorer' | 'discovery'
    searchText: string
}

const SEARCHABLE_KINDS = new Set<TreeNodeType>([
    'table',
    'view',
    'column',
    'procedure',
    'function',
])

function resolveDatabaseLabel(ancestors: TreeNode[], dbType?: DbType): string {
    const database = ancestors.find((node) => node.type === 'database')
    const schema = ancestors.find((node) => node.type === 'schema')
    if (!database) return ''
    if (isCatalogSchemaDbType(dbType) && schema) {
        return `${database.label}.${schema.label}`
    }
    return database.label
}

function resolveTableName(ancestors: TreeNode[], node: TreeNode): string | undefined {
    if (node.type === 'table' || node.type === 'view') return node.label
    const table = ancestors.find((item) => item.type === 'table' || item.type === 'view')
    return table?.label
}

function buildQualifiedLabel(
    name: string,
    database: string,
    tableName: string | undefined,
    kind: GlobalObjectSearchKind,
): string {
    if (!database) return name
    if (kind === 'column' && tableName) {
        return `${database}.${tableName}.${name}`
    }
    return `${database}.${name}`
}

function toSearchKind(type: TreeNodeType): GlobalObjectSearchKind | null {
    if (SEARCHABLE_KINDS.has(type)) {
        return type as GlobalObjectSearchKind
    }
    return null
}

/** 从已加载 Explorer 树索引可搜索对象（表/视图/列/过程） */
export function indexGlobalObjectSearchEntries(tree: readonly TreeNode[]): GlobalObjectSearchEntry[] {
    const entries: GlobalObjectSearchEntry[] = []

    walkTree([...tree], (node, parents) => {
        const kind = toSearchKind(node.type)
        if (!kind) return

        const connection = parents.find((item) => item.type === 'connection')
        if (!connection) return

        const database = resolveDatabaseLabel(parents, connection.dbType)
        const tableName = resolveTableName(parents, node)
        const qualifiedLabel = buildQualifiedLabel(node.label, database, tableName, kind)
        const searchText = appendPinyinSearchKeys([
            node.label,
            qualifiedLabel,
            connection.label,
            database,
            tableName,
            kind,
            node.meta,
            node.comment,
        ])

        entries.push({
            nodeId: node.id,
            kind,
            name: node.label,
            qualifiedLabel,
            connectionId: connection.id,
            connectionLabel: connection.label,
            database,
            dbType: connection.dbType,
            tableName,
            source: 'explorer',
            searchText,
        })
    })

    return entries
}

function tokenizeQuery(query: string): string[] {
    return query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
}

function scoreEntry(entry: GlobalObjectSearchEntry, tokens: string[]): number {
    let score = 0
    const name = entry.name.toLowerCase()
    const qualified = entry.qualifiedLabel.toLowerCase()
    const nameInitials = toPinyinInitials(entry.name)

    for (const token of tokens) {
        const inText = entry.searchText.includes(token)
        const inInitials = token.length >= 2 && nameInitials.includes(token)
        if (!inText && !inInitials) return -1
        if (name === token) score += 120
        else if (name.startsWith(token)) score += 80
        else if (nameInitials === token) score += 75
        else if (nameInitials.startsWith(token) && token.length >= 2) score += 65
        else if (qualified.startsWith(token)) score += 60
        else if (name.includes(token)) score += 40
        else if (inInitials) score += 35
        else score += 15
    }

    return score
}

/** 模糊搜索；无 query 时返回前 limit 条（按名称排序） */
export function searchGlobalObjectEntries(
    entries: readonly GlobalObjectSearchEntry[],
    query: string,
    limit = 50,
): GlobalObjectSearchEntry[] {
    const tokens = tokenizeQuery(query)
    if (!tokens.length) {
        return [...entries]
            .sort((a, b) => a.qualifiedLabel.localeCompare(b.qualifiedLabel))
            .slice(0, limit)
    }

    return entries
        .map((entry) => ({entry, score: scoreEntry(entry, tokens)}))
        .filter((item) => item.score >= 0)
        .sort((a, b) => b.score - a.score || a.entry.qualifiedLabel.localeCompare(b.entry.qualifiedLabel))
        .slice(0, limit)
        .map((item) => item.entry)
}
