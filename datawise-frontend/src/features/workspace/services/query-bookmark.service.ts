import type {SavedConsole, TeamSharedQuerySummary} from '@/core/types'
import type {SqlSnippetConfig} from '@/features/settings/constants/sql-editor-shortcuts-presets'
import {
    REPORT_SQL_TEMPLATES,
    type ReportTemplateCategory,
} from '@/features/workspace/constants/report-sql-templates'
import {t} from '@/i18n'

export type QueryBookmarkSource = 'console' | 'shared-snippet' | 'report-template' | 'team-library'

export interface QueryBookmarkItem {
    id: string
    name: string
    sql: string
    connectionName?: string
    folder: string
    tags: string[]
    teamShared?: boolean
    source: QueryBookmarkSource
    reportCategory?: ReportTemplateCategory
    description?: string
    updatedAt?: string
    /** Team Query Library row — open via shared-query detail API */
    teamId?: string
    teamQueryId?: string
}

/** Canonical storage key; legacy zh {@code 默认} still accepted via {@link #normalizeBookmarkFolder}. */
export const DEFAULT_BOOKMARK_FOLDER = 'default'

/** Canonical storage key; legacy zh {@code 团队片段} still accepted via {@link #normalizeBookmarkFolder}. */
export const SHARED_SNIPPET_FOLDER = 'shared-snippet'

/** Internal marker tag — never shown; filter with source === 'report-template' */
export const REPORT_TEMPLATE_TAG = '__report_template__'

/** Storage folder prefix; legacy zh {@code 报表模板} still accepted via {@link #normalizeBookmarkFolder}. */
export const REPORT_TEMPLATE_FOLDER_PREFIX = 'report-template'

/** Team Query Library folder in the SQL sidebar bookmark panel. */
export const QUERY_LIBRARY_FOLDER = 'query-library'

const LEGACY_DEFAULT_BOOKMARK_FOLDERS = new Set(['默认', 'default'])
const LEGACY_SHARED_SNIPPET_FOLDERS = new Set(['团队片段', 'shared-snippet'])
const LEGACY_QUERY_LIBRARY_FOLDERS = new Set(['query-library', 'Query Library', '查询库'])
const LEGACY_REPORT_TEMPLATE_PREFIXES = ['报表模板/', 'report-template/'] as const

export function isDefaultBookmarkFolder(folder: string): boolean {
    return LEGACY_DEFAULT_BOOKMARK_FOLDERS.has(folder)
}

export function isSharedSnippetFolder(folder: string): boolean {
    return LEGACY_SHARED_SNIPPET_FOLDERS.has(folder)
}

export function isQueryLibraryFolder(folder: string): boolean {
    return LEGACY_QUERY_LIBRARY_FOLDERS.has(folder)
}

export function normalizeBookmarkFolder(folder?: string | null): string {
    const trimmed = folder?.trim()
    if (!trimmed || isDefaultBookmarkFolder(trimmed)) {
        return DEFAULT_BOOKMARK_FOLDER
    }
    if (isSharedSnippetFolder(trimmed)) {
        return SHARED_SNIPPET_FOLDER
    }
    if (isQueryLibraryFolder(trimmed)) {
        return QUERY_LIBRARY_FOLDER
    }
    for (const prefix of LEGACY_REPORT_TEMPLATE_PREFIXES) {
        if (trimmed.startsWith(prefix)) {
            return `${REPORT_TEMPLATE_FOLDER_PREFIX}/${trimmed.slice(prefix.length)}`
        }
    }
    return trimmed
}

export function parseBookmarkTags(raw?: string | null): string[] {
    if (!raw?.trim()) return []
    return [...new Set(
        raw.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
    )]
}

export function formatBookmarkTags(tags: string[]): string {
    return tags.join(', ')
}

export function bookmarksFromSavedConsoles(consoles: SavedConsole[]): QueryBookmarkItem[] {
    return consoles.map((item) => ({
        id: item.id,
        name: item.name,
        sql: item.sql ?? '',
        connectionName: item.connectionName,
        folder: normalizeBookmarkFolder(item.folder),
        tags: item.tags ?? [],
        teamShared: item.teamShared,
        source: 'console' as const,
        updatedAt: item.updatedAt,
    }))
}

export function bookmarksFromSharedSnippets(snippets: SqlSnippetConfig[]): QueryBookmarkItem[] {
    return snippets
        .filter((snippet) => !snippet.builtin && snippet.insertText?.trim())
        .map((snippet) => ({
            id: `snippet:${snippet.id}`,
            name: snippet.label || snippet.id,
            sql: snippet.insertText,
            folder: SHARED_SNIPPET_FOLDER,
            tags: snippet.detail ? [snippet.detail] : [],
            teamShared: true,
            source: 'shared-snippet' as const,
        }))
}

export function reportTemplateFolder(category: ReportTemplateCategory): string {
    return `${REPORT_TEMPLATE_FOLDER_PREFIX}/${category}`
}

export function bookmarksFromReportTemplates(
    templates = REPORT_SQL_TEMPLATES,
): QueryBookmarkItem[] {
    return templates.map((template) => ({
        id: `report:${template.id}`,
        name: t(`shortcut.bookmarks.templates.${template.id}.name`),
        sql: template.sql,
        folder: reportTemplateFolder(template.category),
        tags: [
            ...template.tagKeys.map((key) => t(`shortcut.bookmarks.templateTags.${key}`)),
            REPORT_TEMPLATE_TAG,
        ],
        source: 'report-template' as const,
        reportCategory: template.category,
        description: t(`shortcut.bookmarks.templates.${template.id}.description`),
    }))
}

/** Map team shared queries into sidebar bookmark rows (SQL loaded on open). */
export function bookmarksFromTeamLibrary(
    teamId: string,
    queries: readonly TeamSharedQuerySummary[],
): QueryBookmarkItem[] {
    if (!teamId.trim()) return []
    return queries.map((query) => ({
        id: `team-library:${teamId}:${query.id}`,
        name: query.title,
        sql: '',
        connectionName: query.connectionName || undefined,
        folder: QUERY_LIBRARY_FOLDER,
        tags: [...(query.tags ?? [])],
        teamShared: true,
        source: 'team-library' as const,
        description: query.description || undefined,
        updatedAt: query.updatedAt || query.sharedAt,
        teamId,
        teamQueryId: query.id,
    }))
}

export function mergeQueryBookmarks(
    consoles: SavedConsole[],
    sharedSnippets: SqlSnippetConfig[] = [],
    includeReportTemplates = true,
    teamLibrary: readonly QueryBookmarkItem[] = [],
): QueryBookmarkItem[] {
    return [
        ...teamLibrary,
        ...(includeReportTemplates ? bookmarksFromReportTemplates() : []),
        ...bookmarksFromSavedConsoles(consoles),
        ...bookmarksFromSharedSnippets(sharedSnippets),
    ]
}

export function collectBookmarkTags(items: readonly QueryBookmarkItem[]): string[] {
    const tags = new Set<string>()
    for (const item of items) {
        if (item.source === 'report-template') continue
        for (const tag of item.tags) {
            if (tag !== REPORT_TEMPLATE_TAG) tags.add(tag)
        }
    }
    return [...tags].sort((a, b) => a.localeCompare(b))
}

export function countQueryBookmarks(
    consoles: SavedConsole[],
    sharedSnippets: SqlSnippetConfig[] = [],
): number {
    return mergeQueryBookmarks(consoles, sharedSnippets).length
}

export function collectBookmarkFolders(items: readonly QueryBookmarkItem[]): string[] {
    const folders = new Set<string>()
    for (const item of items) {
        folders.add(normalizeBookmarkFolder(item.folder))
    }
    return [...folders].sort((a, b) => {
        if (a === DEFAULT_BOOKMARK_FOLDER) return -1
        if (b === DEFAULT_BOOKMARK_FOLDER) return 1
        return a.localeCompare(b)
    })
}

export function filterQueryBookmarks(
    items: readonly QueryBookmarkItem[],
    query: string,
    tag?: string | null,
    reportCategory?: ReportTemplateCategory | null,
): QueryBookmarkItem[] {
    const q = query.trim().toLowerCase()
    const activeTag = tag?.trim()
    return items.filter((item) => {
        if (reportCategory && item.reportCategory !== reportCategory) return false
        if (activeTag && !item.tags.includes(activeTag)) return false
        if (!q) return true
        return item.name.toLowerCase().includes(q)
            || item.description?.toLowerCase().includes(q)
            || item.sql.toLowerCase().includes(q)
            || item.connectionName?.toLowerCase().includes(q)
            || item.folder.toLowerCase().includes(q)
            || item.tags.some((value) => value.toLowerCase().includes(q))
    })
}

export function groupBookmarksByFolder(items: readonly QueryBookmarkItem[]): [string, QueryBookmarkItem[]][] {
    const map = new Map<string, QueryBookmarkItem[]>()
    for (const item of items) {
        const folder = normalizeBookmarkFolder(item.folder)
        const list = map.get(folder) ?? []
        list.push(item)
        map.set(folder, list)
    }
    const folders = collectBookmarkFolders(items)
    folders.sort((a, b) => {
        if (a === QUERY_LIBRARY_FOLDER) return -1
        if (b === QUERY_LIBRARY_FOLDER) return 1
        const aReport = a.startsWith(`${REPORT_TEMPLATE_FOLDER_PREFIX}/`)
        const bReport = b.startsWith(`${REPORT_TEMPLATE_FOLDER_PREFIX}/`)
        if (aReport && !bReport) return -1
        if (!aReport && bReport) return 1
        if (a === DEFAULT_BOOKMARK_FOLDER) return -1
        if (b === DEFAULT_BOOKMARK_FOLDER) return 1
        return a.localeCompare(b)
    })
    return folders.map((folder) => [folder, map.get(folder) ?? []])
}
