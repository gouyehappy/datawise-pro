import type {TeamAuditLog, TeamAuditLogQuery} from '@/core/types'

export type TeamAuditExportFormat = 'csv' | 'json'

export interface TeamAuditExportOptions {
    includeFullSql: boolean
}

export type {TeamAuditLogQuery}

const SQL_MARKER = ' | sql:'
const DETAIL_PREVIEW_MAX = 120

export function extractSqlFromAuditDetail(detail: string): string {
    const trimmed = detail.trim()
    const markerIndex = trimmed.indexOf(SQL_MARKER)
    if (markerIndex >= 0) {
        return trimmed.slice(markerIndex + SQL_MARKER.length)
    }
    if (trimmed.startsWith('sql:')) {
        return trimmed.slice(4)
    }
    return ''
}

export function formatAuditDetailForExport(detail: string, includeFullSql: boolean): string {
    if (includeFullSql) {
        return detail
    }
    if (detail.length <= DETAIL_PREVIEW_MAX) {
        return detail
    }
    return `${detail.slice(0, DETAIL_PREVIEW_MAX)}…`
}

function escapeCsvCell(value: string): string {
    if (/[",\n\r]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`
    }
    return value
}

export function serializeAuditLogsToCsv(
    logs: readonly TeamAuditLog[],
    options: TeamAuditExportOptions,
): string {
    const headers = options.includeFullSql
        ? ['createdAt', 'tenantId', 'actorUserName', 'actorUserId', 'action', 'detail', 'sql']
        : ['createdAt', 'tenantId', 'actorUserName', 'actorUserId', 'action', 'detail']
    const lines = logs.map((log) => {
        const detail = formatAuditDetailForExport(log.detail ?? '', options.includeFullSql)
        const cells = [
            log.createdAt,
            log.tenantId ?? '',
            log.actorUserName,
            String(log.actorUserId),
            log.action,
            detail,
        ]
        if (options.includeFullSql) {
            cells.push(extractSqlFromAuditDetail(log.detail ?? ''))
        }
        return cells.map((cell) => escapeCsvCell(cell)).join(',')
    })
    return [headers.join(','), ...lines].join('\n')
}

export function serializeAuditLogsToJson(
    logs: readonly TeamAuditLog[],
    options: TeamAuditExportOptions,
): string {
    const payload = logs.map((log) => {
        const detail = formatAuditDetailForExport(log.detail ?? '', options.includeFullSql)
        const item: Record<string, string | number> = {
            id: log.id,
            tenantId: log.tenantId ?? '',
            createdAt: log.createdAt,
            actorUserId: log.actorUserId,
            actorUserName: log.actorUserName,
            action: log.action,
            detail,
        }
        if (options.includeFullSql) {
            item.sql = extractSqlFromAuditDetail(log.detail ?? '')
        }
        return item
    })
    return JSON.stringify(payload, null, 2)
}

export function buildTeamAuditExportFileName(teamName: string, format: TeamAuditExportFormat): string {
    const stem = teamName.trim().replace(/[^\w\u4e00-\u9fff-]+/g, '_').replace(/_+/g, '_') || 'team'
    const date = new Date().toISOString().slice(0, 10)
    return `${stem}-audit-${date}.${format}`
}

export function downloadTeamAuditExport(
    content: string,
    fileName: string,
    mimeType: string,
): void {
    const blob = new Blob([content], {type: mimeType})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
}

export function toAuditQueryInstantFromDateInput(date: string, endOfDay: boolean): string | undefined {
    const trimmed = date.trim()
    if (!trimmed) return undefined
    const suffix = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000'
    const parsed = new Date(`${trimmed}${suffix}`)
    if (Number.isNaN(parsed.getTime())) return undefined
    return parsed.toISOString()
}

export function filterAuditLogsClientSide(
    logs: readonly TeamAuditLog[],
    query: TeamAuditLogQuery,
): TeamAuditLog[] {
    return logs.filter((log) => {
        if (query.actorUserId != null && log.actorUserId !== query.actorUserId) {
            return false
        }
        const createdAt = Date.parse(log.createdAt)
        if (Number.isNaN(createdAt)) {
            return true
        }
        if (query.since && createdAt < Date.parse(query.since)) {
            return false
        }
        if (query.until && createdAt > Date.parse(query.until)) {
            return false
        }
        return true
    })
}
