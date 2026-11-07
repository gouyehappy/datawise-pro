import type {AppNotification, NotificationCategory} from '@/core/types'
import {createId} from '@/core/utils/id'

export function createNotification(input: {
    category: NotificationCategory
    titleKey: string
    bodyKey: string
    params?: Record<string, string | number>
    read?: boolean
}): AppNotification {
    return {
        id: createId('notify'),
        category: input.category,
        titleKey: input.titleKey,
        bodyKey: input.bodyKey,
        params: input.params,
        createdAt: Date.now(),
        read: input.read ?? false,
    }
}

export function formatNotificationTime(
    createdAt: number,
    now: number,
    t: (key: string, params?: Record<string, unknown>) => string,
): string {
    const diffMs = Math.max(0, now - createdAt)
    const minutes = Math.floor(diffMs / 60_000)
    if (minutes < 1) return t('notification.time.justNow')
    if (minutes < 60) return t('notification.time.minutesAgo', {count: minutes})

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('notification.time.hoursAgo', {count: hours})

    const days = Math.floor(hours / 24)
    if (days < 7) return t('notification.time.daysAgo', {count: days})

    return new Date(createdAt).toLocaleString(undefined, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export function categoryAccent(category: NotificationCategory): string {
    switch (category) {
        case 'system':
            return 'var(--dw-primary)'
        case 'export':
            return '#0891b2'
        case 'workspace':
            return '#d97706'
        default:
            return 'var(--dw-text-muted)'
    }
}

export function categorySoftBg(category: NotificationCategory): string {
    switch (category) {
        case 'system':
            return 'color-mix(in srgb, var(--dw-primary) 12%, var(--dw-bg))'
        case 'export':
            return 'color-mix(in srgb, #0891b2 12%, var(--dw-bg))'
        case 'workspace':
            return 'color-mix(in srgb, #d97706 14%, var(--dw-bg))'
        default:
            return 'var(--dw-bg-muted)'
    }
}

export interface SlowQueryNotificationDetails {
    connectionLabel?: string
    duration: string
    threshold: number
    sql: string
}

export function resolveSlowQueryDetails(item: AppNotification): SlowQueryNotificationDetails | null {
    if (item.titleKey !== 'alertSlowQuery' || !item.params) return null
    const duration = String(item.params.duration ?? '').trim()
    const sql = String(item.params.sql ?? '').trim()
    const threshold = Number(item.params.threshold)
    if (!duration || !sql || !Number.isFinite(threshold)) return null

    const rawConnection = String(item.params.connection ?? '').trim()
    const quoted = rawConnection.match(/「([^」]+)」/)?.[1]?.trim()
    const connectionLabel = quoted
        || rawConnection.replace(/[·•]\s*$/, '').trim()
        || undefined

    return {
        connectionLabel,
        duration,
        threshold,
        sql,
    }
}
