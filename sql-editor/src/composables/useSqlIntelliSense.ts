import {computed, ref, watch} from 'vue'
import type {Ref} from 'vue'
import {findReferencedTables} from '@sql-editor/utils/parse-references'
import {mergeForeignKeys, normalizeColumnMeta} from '@sql-editor/utils/schema-columns'
import {withSchemaColumnCount} from '@sql-editor/utils/schema-metrics'
import {
    extractCatalogSchemaRefreshPrefixes,
    extractDatabaseTableScopes,
    normalizeDatabaseScopeKey,
} from '@sql-editor/utils/qualified-database-scopes'
import type {
    SqlColumnMeta,
    SqlDatabaseTablesIndex,
    SqlEditorSchema,
    SqlForeignKey,
    SqlSchemaProvider,
    SqlTableColumnsResult
} from '@sql-editor/types'

export interface UseSqlIntelliSenseOptions {
    sql: Ref<string>
    schema?: Ref<SqlEditorSchema | undefined>
    connectionId?: Ref<string | undefined>
    databaseName?: Ref<string | undefined>
    schemaProvider?: SqlSchemaProvider
}

function normalizeLoadColumns(result: SqlTableColumnsResult | SqlColumnMeta[]): SqlTableColumnsResult {
    if (Array.isArray(result)) {
        return {columns: normalizeColumnMeta(result)}
    }
    return {
        columns: normalizeColumnMeta(result.columns),
        foreignKeys: result.foreignKeys,
    }
}

function mergeTablesByDatabase(
    bundles: Record<string, SqlDatabaseTablesIndex>,
): {
    tables: string[]
    tableIds: Record<string, string>
    tableCatalogs: Record<string, string>
    tableComments: Record<string, string>
} {
    const tables: string[] = []
    const tableIds: Record<string, string> = {}
    const tableCatalogs: Record<string, string> = {}
    const tableComments: Record<string, string> = {}
    const seen = new Set<string>()

    for (const [database, bundle] of Object.entries(bundles)) {
        for (const table of bundle.tables) {
            const key = table.toLowerCase()
            if (seen.has(key)) continue
            seen.add(key)
            tables.push(table)
            tableIds[table] = bundle.tableIds[table]
            tableCatalogs[table] = database
            const comment = bundle.tableComments?.[table]?.trim()
            if (comment) tableComments[table] = comment
        }
    }

    return {tables, tableIds, tableCatalogs, tableComments}
}

/** 动态加载表 / 列 / 外键，供 SqlEditor 智能补全使用 */
export function useSqlIntelliSense(options: UseSqlIntelliSenseOptions) {
    const tablesByDatabase = ref<Record<string, SqlDatabaseTablesIndex>>({})
    const catalogs = ref<string[]>([])
    const schemasByCatalog = ref<Record<string, string[]>>({})
    const columnsByTable = ref<Record<string, SqlColumnMeta[]>>({})
    const foreignKeys = ref<SqlForeignKey[]>([])
    const loadingTables = ref(false)
    const loadingColumns = ref(false)

    let tablesRequest = 0
    let columnsRequest = 0
    let scopedTablesRequest = 0
    let catalogSchemaRequest = 0

    function applyMergedTables() {
        const merged = mergeTablesByDatabase(tablesByDatabase.value)
        return merged
    }

    const mergedTables = computed(() => mergeTablesByDatabase(tablesByDatabase.value))

    async function loadTablesForScope(databaseName: string, requestToken: number, tokenRef: () => number) {
        const provider = options.schemaProvider
        const connId = options.connectionId?.value
        if (!provider || !connId || !databaseName.trim()) return

        const key = normalizeDatabaseScopeKey(databaseName)
        const existingEntry = Object.entries(tablesByDatabase.value).find(
            ([scope]) => normalizeDatabaseScopeKey(scope) === key,
        )
        const existing = existingEntry?.[1]
        // 已有表且注释已解析过 → 跳过；注释未解析时再拉一次补旁注
        if (existing?.tables.length && existing.commentsResolved) return

        const result = await provider.loadTables(connId, databaseName)
        if (requestToken !== tokenRef()) return

        const scopeKey = existingEntry?.[0] ?? databaseName.trim()
        const nextComments =
            result.tableComments && Object.keys(result.tableComments).length
                ? {...(existing?.tableComments ?? {}), ...result.tableComments}
                : existing?.tableComments
        tablesByDatabase.value = {
            ...tablesByDatabase.value,
            [scopeKey]: {
                tables: existing?.tables.length ? existing.tables : result.tables,
                tableIds: existing?.tables.length
                    ? {...existing.tableIds, ...result.tableIds}
                    : result.tableIds,
                ...(nextComments && Object.keys(nextComments).length
                    ? {tableComments: nextComments}
                    : {}),
                commentsResolved: true,
            },
        }
    }

    async function reloadTables() {
        const provider = options.schemaProvider
        const connId = options.connectionId?.value
        const dbName = options.databaseName?.value

        if (!provider || !connId) {
            tablesByDatabase.value = {}
            catalogs.value = []
            schemasByCatalog.value = {}
            columnsByTable.value = {}
            foreignKeys.value = []
            return
        }

        const requestId = ++tablesRequest
        loadingTables.value = true
        try {
            if (provider.loadCatalogSchemaIndex) {
                const index = await provider.loadCatalogSchemaIndex(connId)
                if (requestId !== tablesRequest) return
                catalogs.value = index.catalogs ?? []
                schemasByCatalog.value = index.schemasByCatalog ?? {}
            } else {
                catalogs.value = []
                schemasByCatalog.value = {}
            }

            tablesByDatabase.value = {}
            columnsByTable.value = {}
            foreignKeys.value = []

            const scopes = new Set<string>(
                extractDatabaseTableScopes(options.sql.value, {schemasByCatalog: schemasByCatalog.value}),
            )
            if (dbName?.trim()) scopes.add(dbName.trim())

            for (const scope of scopes) {
                await loadTablesForScope(scope, requestId, () => tablesRequest)
            }
        } finally {
            if (requestId === tablesRequest) loadingTables.value = false
        }
    }

    async function syncCatalogSchemasForSql() {
        const provider = options.schemaProvider
        const connId = options.connectionId?.value
        if (!provider?.loadCatalogSchemaIndex || !connId) return

        const missing = extractCatalogSchemaRefreshPrefixes(
            options.sql.value,
            schemasByCatalog.value,
        )
        if (!missing.length) return

        const requestId = ++catalogSchemaRequest
        try {
            const index = await provider.loadCatalogSchemaIndex(connId)
            if (requestId !== catalogSchemaRequest) return
            catalogs.value = index.catalogs ?? catalogs.value
            schemasByCatalog.value = {
                ...schemasByCatalog.value,
                ...index.schemasByCatalog,
            }
        } catch {
            // Explorer 未就绪时忽略，下次输入再试
        }
    }

    async function syncTablesForSql() {
        const provider = options.schemaProvider
        const connId = options.connectionId?.value
        if (!provider || !connId) return

        const scopes = extractDatabaseTableScopes(options.sql.value, {
            schemasByCatalog: schemasByCatalog.value,
        })
        const dbName = options.databaseName?.value?.trim()
        if (dbName) scopes.push(dbName)

        const missing = scopes.filter((scope) => {
            const key = normalizeDatabaseScopeKey(scope)
            return !Object.entries(tablesByDatabase.value).some(
                ([existing, bundle]) =>
                    normalizeDatabaseScopeKey(existing) === key && bundle.tables.length > 0,
            )
        })
        if (!missing.length) return

        const requestId = ++scopedTablesRequest
        loadingTables.value = true
        try {
            for (const scope of missing) {
                await loadTablesForScope(scope, requestId, () => scopedTablesRequest)
            }
        } finally {
            if (requestId === scopedTablesRequest) loadingTables.value = false
        }
    }

    async function syncColumnsForSql() {
        const merged = mergedTables.value
        const refs = findReferencedTables(options.sql.value, merged.tables)
        const next: Record<string, SqlColumnMeta[]> = {}
        let nextFks = [...foreignKeys.value]

        for (const table of refs) {
            const cached = columnsByTable.value[table]
            if (cached?.length) next[table] = cached
        }

        const missing = refs.filter((table) => !next[table]?.length)
        if (!missing.length) {
            columnsByTable.value = next
            return
        }

        const provider = options.schemaProvider
        if (!provider) {
            columnsByTable.value = next
            return
        }

        const requestId = ++columnsRequest
        loadingColumns.value = true
        try {
            for (const table of missing) {
                const tableId = merged.tableIds[table]
                if (!tableId) continue
                const loaded = normalizeLoadColumns(await provider.loadColumns(tableId))
                if (requestId !== columnsRequest) return
                if (loaded.columns.length) next[table] = loaded.columns
                if (loaded.foreignKeys?.length) {
                    nextFks = mergeForeignKeys(nextFks, loaded.foreignKeys)
                }
            }
            if (requestId === columnsRequest) {
                columnsByTable.value = next
                foreignKeys.value = nextFks
            }
        } finally {
            if (requestId === columnsRequest) loadingColumns.value = false
        }
    }

    if (options.connectionId && options.schemaProvider) {
        watch(
            [options.connectionId, options.databaseName, () => options.schemaProvider?.isReady?.()],
            () => void reloadTables(),
            {immediate: true},
        )

        let tableSyncTimer: ReturnType<typeof setTimeout> | null = null
        watch(
            options.sql,
            () => {
                if (tableSyncTimer) clearTimeout(tableSyncTimer)
                tableSyncTimer = setTimeout(() => {
                    void syncCatalogSchemasForSql()
                    void syncTablesForSql()
                }, 120)
            },
            {immediate: true},
        )

        let columnSyncTimer: ReturnType<typeof setTimeout> | null = null
        watch(
            [options.sql, mergedTables],
            () => {
                const refs = findReferencedTables(options.sql.value, mergedTables.value.tables)
                const missing = refs.filter((table) => !columnsByTable.value[table]?.length)
                if (missing.length > 0) {
                    if (columnSyncTimer) clearTimeout(columnSyncTimer)
                    void syncColumnsForSql()
                    return
                }
                if (columnSyncTimer) clearTimeout(columnSyncTimer)
                columnSyncTimer = setTimeout(() => void syncColumnsForSql(), 200)
            },
            {immediate: true},
        )
    }

    const dynamicSchema = computed<SqlEditorSchema>(() => {
        const comments = mergedTables.value.tableComments
        return withSchemaColumnCount({
            tables: mergedTables.value.tables,
            columns: {...columnsByTable.value},
            foreignKeys: foreignKeys.value,
            tableCatalogs: mergedTables.value.tableCatalogs,
            ...(Object.keys(comments).length ? {tableComments: comments} : {}),
            catalogs: catalogs.value,
            schemasByCatalog: schemasByCatalog.value,
            tablesByDatabase: {...tablesByDatabase.value},
        })
    })

    const schema = computed<SqlEditorSchema>(() => {
        const staticSchema = options.schema?.value
        if (staticSchema && !options.schemaProvider) return withSchemaColumnCount(staticSchema)
        if (staticSchema && options.schemaProvider) {
            return withSchemaColumnCount({
                tables: [...new Set([...staticSchema.tables, ...dynamicSchema.value.tables])],
                columns: {...dynamicSchema.value.columns, ...staticSchema.columns},
                foreignKeys: mergeForeignKeys(
                    dynamicSchema.value.foreignKeys ?? [],
                    staticSchema.foreignKeys ?? [],
                ),
                tableCatalogs: {
                    ...dynamicSchema.value.tableCatalogs,
                    ...staticSchema.tableCatalogs,
                },
                ...(() => {
                    const merged = {
                        ...dynamicSchema.value.tableComments,
                        ...staticSchema.tableComments,
                    }
                    return Object.keys(merged).length ? {tableComments: merged} : {}
                })(),
                catalogs: [
                    ...new Set([
                        ...(dynamicSchema.value.catalogs ?? []),
                        ...(staticSchema.catalogs ?? []),
                    ]),
                ],
                schemasByCatalog: {
                    ...dynamicSchema.value.schemasByCatalog,
                    ...staticSchema.schemasByCatalog,
                },
                tablesByDatabase: {
                    ...dynamicSchema.value.tablesByDatabase,
                    ...staticSchema.tablesByDatabase,
                },
            })
        }
        return dynamicSchema.value
    })

    const loading = computed(() => loadingTables.value || loadingColumns.value)

    return {
        schema,
        loading,
        loadingTables,
        loadingColumns,
        reloadTables,
    }
}
