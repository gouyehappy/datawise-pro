import {instanceSqlApi} from '@/api'
import type {SchemaScope} from '@/features/schema-compare/types/schema-compare.types'

export async function exportSchemaCompareMigration(options: {
    scope: SchemaScope
    fileName: string
    ddl: string
}): Promise<string> {
    const result = await instanceSqlApi.save({
        connectionId: options.scope.connectionId,
        instanceName: options.scope.database,
        sql: options.ddl,
        fileName: options.fileName,
    })
    return result.relativePath
}
