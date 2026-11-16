import {defineStore} from 'pinia'
import {computed, ref} from 'vue'
import type {AppNotification, NotificationCategory} from '@/core/types'
import {notificationsApi} from '@/api'
import {isGuestOrAnonymousSession} from '@/features/auth/services/user-access-policy'

/** 应用内通知（后端持久化） */
export const useNotificationStore = defineStore('notification', () => {
    const items = ref<AppNotification[]>([])
    const ready = ref(false)

    const unreadCount = computed(() => items.value.filter((item) => !item.read).length)

    /** 访客无个人通知，落空态即可，避免启动阶段向登录专属接口发请求。 */
    function resetForGuest() {
        items.value = []
        ready.value = true
    }

    async function load() {
        if (isGuestOrAnonymousSession()) {
            resetForGuest()
            return
        }
        items.value = await notificationsApi.fetchAll()
        ready.value = true
    }

    async function push(input: {
        category: NotificationCategory
        titleKey: string
        bodyKey: string
        params?: Record<string, string | number>
    }) {
        const created = await notificationsApi.push(input)
        items.value = [created, ...items.value]
    }

    async function markAllRead() {
        await notificationsApi.markAllRead()
        items.value = items.value.map((item) => ({...item, read: true}))
    }

    async function markRead(id: string) {
        const item = items.value.find((entry) => entry.id === id)
        if (!item || item.read) return
        await notificationsApi.markRead(id)
        item.read = true
    }

    async function remove(id: string) {
        await notificationsApi.remove(id)
        items.value = items.value.filter((item) => item.id !== id)
    }

    async function clearRead() {
        await notificationsApi.clearRead()
        items.value = items.value.filter((item) => !item.read)
    }

    async function clearAll() {
        await notificationsApi.clearAll()
        items.value = []
    }

    return {
        items,
        unreadCount,
        ready,
        load,
        resetForGuest,
        push,
        markAllRead,
        markRead,
        remove,
        clearRead,
        clearAll,
    }
})
