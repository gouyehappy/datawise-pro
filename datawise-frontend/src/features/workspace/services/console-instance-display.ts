import type {DbType} from '@/core/types'
import {isCatalogSchemaDbType} from '@/features/explorer/services/explorer-lazy-load'
import {parseExplorerDatabaseScope} from '@/features/explorer/services/explorer-database-scope'

export interface ConsoleInstanceOptionDisplay {
    primary: string
    meta?: string
}

/** Trino / Presto 可跨 catalog 查询，控制台不展示 schema 选择器 */
export function showsConsoleInstanceSelector(dbType: DbType | undefined): boolean {
    return !isCatalogSchemaDbType(dbType)
}

/** 控制台上下文条：Trino 为 schema，MySQL 等为 database 实例 */
export function consoleInstanceScopeKey(dbType: DbType | undefined): 'ctxSchema' | 'ctxInstance' {
    return isCatalogSchemaDbType(dbType) ? 'ctxSchema' : 'ctxInstance'
}

export function consoleInstanceMenuKey(dbType: DbType | undefined): 'schemasUnder' | 'instancesUnder' {
    return isCatalogSchemaDbType(dbType) ? 'schemasUnder' : 'instancesUnder'
}

export function consoleInstanceSelectTitleKey(dbType: DbType | undefined): 'selectSchema' | 'selectInstance' {
    return isCatalogSchemaDbType(dbType) ? 'selectSchema' : 'selectInstance'
}

/** 触发器上展示的值（内部仍用 catalog.schema 绑定） */
export function formatConsoleInstanceValue(dbType: DbType | undefined, label: string): string {
    const trimmed = label.trim()
    if (!trimmed) return trimmed
    if (!isCatalogSchemaDbType(dbType)) return trimmed

    const scope = parseExplorerDatabaseScope(dbType, trimmed)
    if (scope.schema) {
        return `${scope.catalog} › ${scope.schema}`
    }
    return scope.catalog
}

/** 下拉项：schema 为主标题，catalog 为副标题 */
export function formatConsoleInstanceOption(
    dbType: DbType | undefined,
    label: string,
): ConsoleInstanceOptionDisplay {
    const trimmed = label.trim()
    if (!trimmed || !isCatalogSchemaDbType(dbType)) {
        return {primary: trimmed}
    }

    const scope = parseExplorerDatabaseScope(dbType, trimmed)
    if (scope.schema) {
        return {primary: scope.schema, meta: scope.catalog}
    }
    return {primary: scope.catalog}
}
