import type {TreeNode} from '@/core/types'

export type MongoColumnMeta = {
    key?: string
    name?: string
}

export type MongoCollectionRef = {
    name: string
    nodeId: string
}

/** Flattened grid row → document keyed by field name. */
export function rowToMongoDocument(
    columns: MongoColumnMeta[],
    row: Record<string, unknown>,
): Record<string, unknown> {
    const doc: Record<string, unknown> = {}
    for (const col of columns) {
        const key = col.key
        const name = col.name ?? key
        if (!key || !name) continue
        if (Object.prototype.hasOwnProperty.call(row, key)) {
            doc[name] = row[key]
        }
    }
    return doc
}

export function formatMongoDocumentJson(doc: Record<string, unknown>): string {
    return JSON.stringify(doc, null, 2)
}

export function mongoDocumentLabel(doc: Record<string, unknown>, index: number): string {
    const id = doc._id
    if (id != null && String(id).trim() !== '') return String(id)
    return `#${index + 1}`
}

export function listMongoCollectionsUnderDatabase(databaseNode: TreeNode | null | undefined): MongoCollectionRef[] {
    if (!databaseNode) return []
    const tablesFolder = databaseNode.children?.find(
        (child) => child.type === 'folder' && child.label.toLowerCase() === 'tables',
    )
    const roots = tablesFolder?.children?.length ? tablesFolder.children : (databaseNode.children ?? [])
    const out: MongoCollectionRef[] = []
    for (const child of roots) {
        if (child.type === 'table') {
            out.push({name: child.label, nodeId: child.id})
        }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function findMongoDatabaseNode(
    connectionNode: TreeNode | null | undefined,
    database: string,
): TreeNode | undefined {
    const normalized = database.trim()
    if (!connectionNode || !normalized) return undefined
    return connectionNode.children?.find(
        (child) => child.type === 'database' && child.label === normalized,
    )
}
