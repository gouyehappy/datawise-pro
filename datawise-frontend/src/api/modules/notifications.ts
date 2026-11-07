import {api} from '@/shared/api'
import type {NotificationPushInput} from '@/shared/api/types'

export const notificationsApi = {
    fetchAll: () => api.notifications.fetchAll(),
    push: (input: NotificationPushInput) => api.notifications.push(input),
    markAllRead: () => api.notifications.markAllRead(),
    markRead: (id: string) => api.notifications.markRead(id),
    remove: (id: string) => api.notifications.remove(id),
    clearRead: () => api.notifications.clearRead(),
    clearAll: () => api.notifications.clearAll(),
}
