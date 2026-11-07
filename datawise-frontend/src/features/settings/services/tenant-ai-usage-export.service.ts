import type {TenantAiUsage} from '@/shared/api/types'

/** JSON/CSV payload for tenant AI usage copy/download. */
export function formatTenantAiUsageJson(usage: TenantAiUsage): string {
    return JSON.stringify(
        {
            tenantId: usage.tenantId,
            day: usage.day,
            calls: usage.calls,
            limit: usage.limit,
            remaining: usage.remaining,
            unlimited: usage.unlimited,
            byCapability: usage.byCapability ?? {},
            exportedAt: new Date().toISOString(),
        },
        null,
        2,
    )
}

export function formatTenantAiUsageCsv(usage: TenantAiUsage, at = new Date()): string {
    const byCap = usage.byCapability ?? {}
    const header = 'tenantId,day,calls,limit,remaining,unlimited,byCapability,exportedAt'
    const row = [
        usage.tenantId,
        usage.day,
        String(usage.calls),
        String(usage.limit),
        String(usage.remaining),
        usage.unlimited ? 'true' : 'false',
        JSON.stringify(byCap),
        at.toISOString(),
    ]
        .map(csvEscape)
        .join(',')
    return `${header}\n${row}\n`
}

export function buildTenantAiUsageExportFilename(
    usage: TenantAiUsage,
    format: 'json' | 'csv',
    at = new Date(),
): string {
    const stamp = at.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const id = usage.tenantId.trim() || 'tenant'
    return `ai-usage-${id}-${usage.day || 'day'}-${stamp}.${format}`
}

export function downloadTenantAiUsageExport(usage: TenantAiUsage, format: 'json' | 'csv' = 'csv'): void {
    const body = format === 'json' ? formatTenantAiUsageJson(usage) : formatTenantAiUsageCsv(usage)
    const mime = format === 'json' ? 'application/json' : 'text/csv;charset=utf-8'
    const blob = new Blob([body], {type: mime})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = buildTenantAiUsageExportFilename(usage, format)
    anchor.click()
    URL.revokeObjectURL(url)
}

function csvEscape(value: string): string {
    if (/[",\n\r]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`
    }
    return value
}
