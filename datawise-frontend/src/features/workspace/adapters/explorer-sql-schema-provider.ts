import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {
    ensureCatalogSchemaIndexLoaded,
    ensureDatabaseTablesLoaded,
    ensureTableColumnsLoaded,
} from '@/features/workspace/services/sql-schema-loader'
import type {SqlSchemaProvider} from '@datawise/sql-editor/types'

/** DataWise Explorer 树 → SqlEditor SchemaProvider 适配 */
export function useExplorerSqlSchemaProvider(): SqlSchemaProvider {
    const explorer = useExplorerStore()

    return {
        isReady: () => explorer.treeReady,
        loadCatalogSchemaIndex: (connectionId) =>
            ensureCatalogSchemaIndexLoaded(explorer, connectionId),
        loadTables: (connectionId, databaseName) =>
            ensureDatabaseTablesLoaded(explorer, connectionId, databaseName),
        loadColumns: (tableId) => ensureTableColumnsLoaded(explorer, tableId),
    }
}
