import type {ConnectionConfig} from '@/core/types'

export const CONNECTIONS_CATALOG_VERSION = 1 as const

export interface ConnectionGroupRecord {
    id: string
    label: string
    parentId?: string | null
    sortOrder: number
    expanded: boolean
    userId?: number | null
    projectId?: string | null
}

export interface ConnectionEntryRecord {
    id: string
    groupId: string
    sortOrder: number
    userId?: number | null
    config: ConnectionConfig
    projectId?: string | null
}

export interface ConnectionsCatalog {
    version: typeof CONNECTIONS_CATALOG_VERSION
    groups: ConnectionGroupRecord[]
    connections: ConnectionEntryRecord[]
}

export function createEmptyConnectionsCatalog(): ConnectionsCatalog {
    return {
        version: CONNECTIONS_CATALOG_VERSION,
        groups: [],
        connections: [],
    }
}
