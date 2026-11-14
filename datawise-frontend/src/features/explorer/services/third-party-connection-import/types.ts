import type {ConnectionConfig, DbType} from '@/core/types'

export type ThirdPartyImportSource = 'datagrip' | 'dbeaver' | 'navicat'

export interface ThirdPartyConnectionDraft {
    /** Stable within one parse pass */
    key: string
    source: ThirdPartyImportSource
    name: string
    dbType: DbType
    host: string
    port: string
    user: string
    database: string
    url: string
    /** Password attribute/field present but not imported (encrypted or policy). */
    passwordOmitted: boolean
    /** Raw vendor type string for diagnostics */
    vendorType?: string
    skipReason?: string
}

export interface ThirdPartyImportParseResult {
    source: ThirdPartyImportSource
    drafts: ThirdPartyConnectionDraft[]
    skipped: Array<{name: string; reason: string}>
}

export type MappedImportConnection = ConnectionConfig & {
    /** Echo for preview; stripped before API if needed */
    _passwordOmitted?: boolean
}
