import type {DbType} from '@/core/types'

export type {AiTableTagCatalogItem} from '@/shared/api/ai.types'

export interface AiTaggedScopeGroup {
    key: string
    connectionId: string
    connectionLabel: string
    database: string
    databaseLabel: string
    dbType: DbType
    groupLabel: string
    tables: string[]
}
