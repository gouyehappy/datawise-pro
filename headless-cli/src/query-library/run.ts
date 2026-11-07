import type {DatawiseClient} from '../client.js'
import {formatCliError} from '../cli-error.js'
import {resolveConnectionRef} from '../connection-resolve.js'
import {
    readQuerySql,
    resolveManifestRoot,
} from './manifest.js'
import type {
    QueryLibraryManifest,
    QueryLibraryManifestQuery,
    QueryLibraryRunResult,
} from './types.js'

export async function runQueryLibrary(
    client: DatawiseClient,
    manifestPath: string,
    manifest: QueryLibraryManifest,
    queries: QueryLibraryManifestQuery[],
): Promise<QueryLibraryRunResult[]> {
    const root = resolveManifestRoot(manifestPath)
    const results: QueryLibraryRunResult[] = []
    const connections = await client.listSqlConnections()

    for (const query of queries) {
        if (!query.connection?.trim()) {
            results.push({
                id: query.id,
                name: query.name,
                status: 'failed',
                message: 'connection id is required',
            })
            continue
        }

        if (query.ci?.enabled === false) {
            results.push({
                id: query.id,
                name: query.name,
                status: 'skipped',
                message: 'ci.enabled is false',
            })
            continue
        }

        try {
            const resolved = resolveConnectionRef(query.connection, connections)
            const sql = readQuerySql(root, query)
            const result = await client.executeSql({
                sql,
                connectionId: resolved.id,
                database: query.database?.trim() || undefined,
                maxRows: query.ci?.maxRows,
            })
            const assertionError = assertCiExpectations(query, result.rowCount)
            if (assertionError) {
                results.push({
                    id: query.id,
                    name: query.name,
                    status: 'failed',
                    rowCount: result.rowCount,
                    durationMs: result.durationMs,
                    message: assertionError,
                })
                continue
            }
            results.push({
                id: query.id,
                name: query.name,
                status: 'success',
                rowCount: result.rowCount,
                durationMs: result.durationMs,
            })
        } catch (error) {
            results.push({
                id: query.id,
                name: query.name,
                status: 'failed',
                message: formatCliError(error),
            })
        }
    }

    return results
}

function assertCiExpectations(query: QueryLibraryManifestQuery, rowCount: number): string | null {
    const ci = query.ci
    if (!ci) return null
    if (ci.expectMinRows != null && rowCount < ci.expectMinRows) {
        return `expected at least ${ci.expectMinRows} rows, got ${rowCount}`
    }
    if (ci.expectMaxRows != null && rowCount > ci.expectMaxRows) {
        return `expected at most ${ci.expectMaxRows} rows, got ${rowCount}`
    }
    return null
}

export function queryLibraryRunExitCode(results: QueryLibraryRunResult[]): number {
    if (results.some((result) => result.status === 'failed')) return 1
    if (results.length === 0) return 1
    return 0
}

export function formatQueryLibraryRunReport(results: QueryLibraryRunResult[], json: boolean): string {
    if (json) {
        return `${JSON.stringify({results}, null, 2)}\n`
    }
    if (!results.length) {
        return 'No queries matched CI run filters\n'
    }
    const lines = results.map((result) => {
        const detail = result.message ? ` — ${result.message}` : ''
        const metrics = result.rowCount != null
            ? ` (${result.rowCount} rows${result.durationMs != null ? `, ${result.durationMs}ms` : ''})`
            : ''
        return `  ${result.status.padEnd(7)} ${result.id}${metrics}${detail}`
    })
    return `${lines.join('\n')}\n`
}
