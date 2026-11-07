import {downloadTextFilesSequentially} from '@/shared/utils/download-text'
import type {QueryBookmarkItem} from '@/features/workspace/services/query-bookmark.service'

export const QUERY_LIBRARY_MANIFEST_VERSION = 1

const ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i

export interface QueryLibraryCiConfig {
    enabled?: boolean
    maxRows?: number
    expectMinRows?: number
    expectMaxRows?: number
}

export interface QueryLibraryManifestQuery {
    id: string
    name: string
    file: string
    connection: string
    connectionName?: string
    database?: string
    tags?: string[]
    ci?: QueryLibraryCiConfig
}

export interface QueryLibraryManifest {
    version: number
    queries: QueryLibraryManifestQuery[]
}

export function slugifyQueryLibraryId(name: string, fallbackId?: string): string {
    const fromName = name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9._-]/g, '')
        .replace(/^-+|-+$/g, '')
    if (fromName && ID_PATTERN.test(fromName)) {
        return fromName.slice(0, 64)
    }
    const fromId = (fallbackId ?? '')
        .trim()
        .replace(/^console:/, '')
        .replace(/[^a-z0-9._-]/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
    if (fromId && ID_PATTERN.test(fromId)) {
        return fromId.slice(0, 64)
    }
    const suffix = (fallbackId ?? 'query').replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase()
    return suffix ? `query-${suffix}` : 'query'
}

export function buildQueryLibraryManifestQuery(
    item: QueryBookmarkItem,
    options?: {connectionId?: string; database?: string},
): QueryLibraryManifestQuery {
    const id = slugifyQueryLibraryId(item.name, item.id)
    const connectionName = item.connectionName?.trim()
    return {
        id,
        name: item.name.trim() || id,
        file: `queries/${id}.sql`,
        connection: options?.connectionId?.trim() ?? '',
        connectionName: connectionName && connectionName !== '—' ? connectionName : undefined,
        database: options?.database?.trim() || undefined,
        tags: item.tags.length ? [...item.tags] : undefined,
        ci: {
            enabled: true,
            maxRows: 100,
        },
    }
}

export function buildQueryLibraryManifest(
    queries: QueryLibraryManifestQuery[],
): QueryLibraryManifest {
    return {
        version: QUERY_LIBRARY_MANIFEST_VERSION,
        queries,
    }
}

export function exportQueryBookmarkForGitCi(item: QueryBookmarkItem): void {
    const query = buildQueryLibraryManifestQuery(item)
    const manifest = buildQueryLibraryManifest([query])
    const sqlFilename = query.file.includes('/') ? query.file.split('/').pop()! : query.file
    downloadTextFilesSequentially([
        {content: item.sql.trim(), filename: sqlFilename, mimeType: 'text/plain;charset=utf-8'},
        {
            content: `${JSON.stringify(manifest, null, 2)}\n`,
            filename: 'query-library.json',
            mimeType: 'application/json;charset=utf-8',
        },
    ])
}
