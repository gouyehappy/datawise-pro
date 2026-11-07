import type {
    ShareTeamSharedQueryPayload,
    TeamSharedQueryComment,
    TeamSharedQuerySummary,
} from '@/core/types'
import {parseBookmarkTags} from '@/features/workspace/services/query-bookmark.service'

export function collectTeamSharedQueryTags(items: readonly TeamSharedQuerySummary[]): string[] {
    const tags = new Set<string>()
    for (const item of items) {
        for (const tag of item.tags ?? []) {
            if (tag.trim()) tags.add(tag.trim())
        }
    }
    return [...tags].sort((a, b) => a.localeCompare(b))
}

export function filterTeamSharedQueries(
    items: readonly TeamSharedQuerySummary[],
    query: string,
    tag?: string | null,
    starredOnly?: boolean,
): TeamSharedQuerySummary[] {
    const q = query.trim().toLowerCase()
    const activeTag = tag?.trim()
    return items.filter((item) => {
        if (starredOnly && !item.starredByCurrentUser) return false
        if (activeTag && !(item.tags ?? []).includes(activeTag)) return false
        if (!q) return true
        return item.title.toLowerCase().includes(q)
            || item.description?.toLowerCase().includes(q)
            || item.connectionName?.toLowerCase().includes(q)
            || item.database?.toLowerCase().includes(q)
            || (item.tags ?? []).some((value) => value.toLowerCase().includes(q))
    })
}

export function canDeleteTeamSharedQueryComment(options: {
    comment: TeamSharedQueryComment
    queryOwnerUserId: number
    currentUserId?: number
    canManage?: boolean
}): boolean {
    if (options.currentUserId == null) return false
    if (options.comment.userId === options.currentUserId) return true
    if (options.queryOwnerUserId === options.currentUserId) return true
    return options.canManage === true
}

export function mergeSharedQuerySummary(
    current: TeamSharedQuerySummary,
    patch: Partial<TeamSharedQuerySummary>,
): TeamSharedQuerySummary {
    return {...current, ...patch}
}

export function buildShareTeamQueryPayload(options: {
    title: string
    description?: string
    connectionId?: string
    connectionName?: string
    database?: string
    sql: string
    tags?: string[]
    tagsText?: string
}): ShareTeamSharedQueryPayload {
    const tags = options.tags ?? (options.tagsText ? parseBookmarkTags(options.tagsText) : [])
    return {
        title: options.title.trim(),
        description: options.description?.trim() || undefined,
        connectionId: options.connectionId?.trim() || undefined,
        connectionName: options.connectionName?.trim() || undefined,
        database: options.database?.trim() || undefined,
        sql: options.sql,
        tags,
    }
}

export async function openTeamSharedQueryInConsole(
    teamId: string,
    summary: TeamSharedQuerySummary,
    deps: {
        getDetail: (teamId: string, queryId: string) => Promise<{sql: string; connectionId?: string; connectionName?: string; database?: string; title?: string}>
        openConsole: (options: {
            connectionId?: string
            connectionName?: string
            database?: string
            sql?: string
            title?: string
            teamSharedQuery?: { teamId: string; queryId: string; title?: string }
        }) => Promise<string | void> | string | void
        setModule: (module: 'database') => void
    },
) {
    const detail = await deps.getDetail(teamId, summary.id)
    deps.setModule('database')
    await deps.openConsole({
        connectionId: detail.connectionId || summary.connectionId || undefined,
        connectionName: detail.connectionName || summary.connectionName || undefined,
        database: detail.database || summary.database || undefined,
        sql: detail.sql,
        title: detail.title || summary.title,
        teamSharedQuery: {
            teamId,
            queryId: summary.id,
            title: detail.title || summary.title,
        },
    })
}
