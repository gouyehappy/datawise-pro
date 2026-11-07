import type {ConnectionEnvironment} from '@/features/connection/services/connection-environment.service'
import {
    analyzeDangerousSql,
    type DangerousSqlPreview,
} from '@/features/workspace/services/dangerous-sql-preview.service'
import type {DangerousSqlPreferences} from '@/shared/config/app-config.types'

function escapeRegex(value: string): string {
    return value.replace(/[.+^${}()|[\]\\]/g, '\\$&')
}

/** Simple glob: `*` matches any substring. */
export function matchesTableGlob(pattern: string, tableName: string): boolean {
    const trimmed = pattern.trim()
    if (!trimmed) return false
    const normalized = tableName.trim()
    if (!normalized) return false
    if (!trimmed.includes('*')) {
        return trimmed.toLowerCase() === normalized.toLowerCase()
    }
    const regex = new RegExp(
        `^${trimmed.split('*').map(escapeRegex).join('.*')}$`,
        'i',
    )
    return regex.test(normalized)
}

export function isDangerousSqlWhitelisted(
    preview: DangerousSqlPreview,
    preferences: DangerousSqlPreferences,
): boolean {
    const tableName = preview.tableName?.trim()
    if (!tableName || !preferences.whitelistedTables.length) {
        return false
    }
    return preferences.whitelistedTables.some((pattern) => matchesTableGlob(pattern, tableName))
}

export function shouldConfirmDangerousSql(
    preview: DangerousSqlPreview,
    context: {
        env: ConnectionEnvironment
        preferences: DangerousSqlPreferences
    },
): boolean {
    if (context.env === 'prod') {
        return true
    }
    if (context.env === 'dev') {
        return false
    }
    if (!context.preferences.confirmEnabled) {
        return false
    }
    return !isDangerousSqlWhitelisted(preview, context.preferences)
}

export function needsDangerousSqlConfirmation(
    sql: string,
    context: {
        env: ConnectionEnvironment
        preferences: DangerousSqlPreferences
    },
): boolean {
    const preview = analyzeDangerousSql(sql)
    if (!preview) return false
    return shouldConfirmDangerousSql(preview, context)
}
