import type {AppNotification, NotificationCategory} from '@/core/types'
import type {NotificationApi, NotificationPushInput} from '@/shared/api/types'
import type {NotificationDto, PushNotificationRequest} from '@/shared/api/generated'
import {deleteJson, getJson, postJson, putJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

function toAppNotification(dto: NotificationDto): AppNotification {
    return {
        id: String(dto.id ?? ''),
        category: (dto.category ?? 'system') as NotificationCategory,
        titleKey: String(dto.titleKey ?? ''),
        bodyKey: String(dto.bodyKey ?? ''),
        params: dto.params as AppNotification['params'],
        createdAt: Number(dto.createdAt ?? 0),
        read: Boolean(dto.read),
    }
}

/**
 * Notifications HTTP client — wire DTOs from OpenAPI (`NotificationDto`).
 * Maps to domain `AppNotification` for store/UI consumers.
 */
export function createHttpNotificationApi(): NotificationApi {
    return {
        fetchAll: async () => {
            const list = await getJson<NotificationDto[]>(API_PATHS.notifications.list)
            return (list ?? []).map(toAppNotification)
        },

        push: async (input: NotificationPushInput) => {
            const body: PushNotificationRequest = {
                category: input.category,
                titleKey: input.titleKey,
                bodyKey: input.bodyKey,
                params: input.params as PushNotificationRequest['params'],
            }
            const created = await postJson<NotificationDto>(API_PATHS.notifications.list, body)
            return toAppNotification(created)
        },

        markAllRead: () => putJson<void>(API_PATHS.notifications.readAll, {}),

        markRead: (id) => putJson<void>(API_PATHS.notifications.read(id), {}),

        remove: (id) => deleteJson<void>(API_PATHS.notifications.item(id)),

        clearRead: () => deleteJson<void>(API_PATHS.notifications.clearRead),

        clearAll: () => deleteJson<void>(API_PATHS.notifications.clearAll),
    }
}
