import {existsSync, readFileSync} from 'node:fs'
import {dirname, isAbsolute, join, resolve} from 'node:path'
import {
    QUERY_LIBRARY_MANIFEST_VERSION,
    type QueryLibraryManifest,
    type QueryLibraryManifestQuery,
    type QueryLibraryValidationIssue,
} from './types.js'

const ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i

export function resolveManifestPath(manifestPath: string): string {
    return resolve(manifestPath)
}

export function resolveManifestRoot(manifestPath: string): string {
    return dirname(resolveManifestPath(manifestPath))
}

export function loadQueryLibraryManifest(manifestPath: string): QueryLibraryManifest {
    const abs = resolveManifestPath(manifestPath)
    let raw: unknown
    try {
        raw = JSON.parse(readFileSync(abs, 'utf8'))
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to read manifest ${abs}: ${message}`)
    }
    if (!raw || typeof raw !== 'object') {
        throw new Error('Manifest must be a JSON object')
    }
    return raw as QueryLibraryManifest
}

export function readQuerySql(manifestRoot: string, query: QueryLibraryManifestQuery): string {
    const sqlPath = isAbsolute(query.file) ? query.file : join(manifestRoot, query.file)
    if (!existsSync(sqlPath)) {
        throw new Error(`SQL file not found: ${sqlPath}`)
    }
    const sql = readFileSync(sqlPath, 'utf8').trim()
    if (!sql) {
        throw new Error(`SQL file is empty: ${sqlPath}`)
    }
    return sql
}

export function validateQueryLibraryManifest(
    manifest: QueryLibraryManifest,
    manifestRoot: string,
): QueryLibraryValidationIssue[] {
    const issues: QueryLibraryValidationIssue[] = []

    if (manifest.version !== QUERY_LIBRARY_MANIFEST_VERSION) {
        issues.push({
            path: 'version',
            message: `Unsupported manifest version ${manifest.version}; expected ${QUERY_LIBRARY_MANIFEST_VERSION}`,
            level: 'error',
        })
    }

    if (!Array.isArray(manifest.queries)) {
        issues.push({path: 'queries', message: 'queries must be an array', level: 'error'})
        return issues
    }

    const seenIds = new Set<string>()
    manifest.queries.forEach((query, index) => {
        const base = `queries[${index}]`
        if (!query || typeof query !== 'object') {
            issues.push({path: base, message: 'query entry must be an object', level: 'error'})
            return
        }

        const id = typeof query.id === 'string' ? query.id.trim() : ''
        if (!id) {
            issues.push({path: `${base}.id`, message: 'id is required', level: 'error'})
        } else if (!ID_PATTERN.test(id)) {
            issues.push({
                path: `${base}.id`,
                message: 'id must use letters, numbers, dot, underscore, or hyphen',
                level: 'error',
            })
        } else if (seenIds.has(id)) {
            issues.push({path: `${base}.id`, message: `duplicate id: ${id}`, level: 'error'})
        } else {
            seenIds.add(id)
        }

        if (!query.name?.trim()) {
            issues.push({path: `${base}.name`, message: 'name is required', level: 'error'})
        }
        if (!query.file?.trim()) {
            issues.push({path: `${base}.file`, message: 'file is required', level: 'error'})
        } else {
            const sqlPath = isAbsolute(query.file) ? query.file : join(manifestRoot, query.file)
            if (!existsSync(sqlPath)) {
                issues.push({path: `${base}.file`, message: `SQL file not found: ${sqlPath}`, level: 'error'})
            } else {
                const sql = readFileSync(sqlPath, 'utf8').trim()
                if (!sql) {
                    issues.push({path: `${base}.file`, message: `SQL file is empty: ${sqlPath}`, level: 'error'})
                }
            }
        }

        if (!query.connection?.trim()) {
            issues.push({
                path: `${base}.connection`,
                message: 'connection is required for CI run (DataWise connection id)',
                level: 'warning',
            })
        }

        const ci = query.ci
        if (ci && typeof ci === 'object') {
            if (ci.maxRows != null && (!Number.isFinite(ci.maxRows) || ci.maxRows <= 0)) {
                issues.push({path: `${base}.ci.maxRows`, message: 'maxRows must be a positive number', level: 'error'})
            }
            if (ci.expectMinRows != null && (!Number.isFinite(ci.expectMinRows) || ci.expectMinRows < 0)) {
                issues.push({
                    path: `${base}.ci.expectMinRows`,
                    message: 'expectMinRows must be >= 0',
                    level: 'error',
                })
            }
            if (ci.expectMaxRows != null && (!Number.isFinite(ci.expectMaxRows) || ci.expectMaxRows < 0)) {
                issues.push({
                    path: `${base}.ci.expectMaxRows`,
                    message: 'expectMaxRows must be >= 0',
                    level: 'error',
                })
            }
            if (
                ci.expectMinRows != null
                && ci.expectMaxRows != null
                && ci.expectMinRows > ci.expectMaxRows
            ) {
                issues.push({
                    path: `${base}.ci`,
                    message: 'expectMinRows cannot exceed expectMaxRows',
                    level: 'error',
                })
            }
        }
    })

    return issues
}

export function hasValidationErrors(issues: QueryLibraryValidationIssue[]): boolean {
    return issues.some((issue) => issue.level === 'error')
}

export function hasValidationFailures(
    issues: QueryLibraryValidationIssue[],
    strict = false,
): boolean {
    if (hasValidationErrors(issues)) return true
    if (strict) return issues.some((issue) => issue.level === 'warning')
    return false
}

export function formatValidationReport(issues: QueryLibraryValidationIssue[], json: boolean): string {
    if (json) {
        return `${JSON.stringify({ok: !hasValidationErrors(issues), issues}, null, 2)}\n`
    }
    if (!issues.length) {
        return 'OK: query library manifest is valid\n'
    }
    const lines = issues.map((issue) => `${issue.level.toUpperCase()} ${issue.path}: ${issue.message}`)
    return `${lines.join('\n')}\n`
}

export function queriesForCiRun(
    manifest: QueryLibraryManifest,
    queryId?: string,
): QueryLibraryManifestQuery[] {
    const enabled = manifest.queries.filter((query) => query.ci?.enabled !== false)
    if (!queryId?.trim()) return enabled
    const match = enabled.find((query) => query.id === queryId.trim())
    return match ? [match] : []
}
