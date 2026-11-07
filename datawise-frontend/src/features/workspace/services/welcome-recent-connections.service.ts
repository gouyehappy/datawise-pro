/**
 * 欢迎页 / 底栏快启连接排序本地持久化。
 * touch 写存储并 bump epoch（底栏可即时刷新）；欢迎页用进入时的 snapshot，不跟着重排。
 */
import {ref} from 'vue'

export const WELCOME_RECENT_CONNECTIONS_STORAGE_KEY = 'dw.welcome.recentConnectionIds'
export const WELCOME_ADDED_CONNECTIONS_STORAGE_KEY = 'dw.welcome.addedConnectionIds'
export const WELCOME_CONNECTION_IDS_MAX = 24

/** 底栏快启等订阅；欢迎页勿依赖此值做即时重排 */
export const welcomeRecentConnectionsEpoch = ref(0)

function canUseStorage(): boolean {
    return typeof localStorage !== 'undefined'
}

function readIdList(storageKey: string): string[] {
    if (!canUseStorage()) return []
    try {
        const raw = localStorage.getItem(storageKey)
        if (!raw) return []
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) return []
        return parsed
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            .map((id) => id.trim())
            .slice(0, WELCOME_CONNECTION_IDS_MAX)
    } catch {
        return []
    }
}

function touchIdList(storageKey: string, connectionId: string): string[] {
    const id = connectionId.trim()
    if (!id) return readIdList(storageKey)
    const next = [id, ...readIdList(storageKey).filter((item) => item !== id)]
        .slice(0, WELCOME_CONNECTION_IDS_MAX)
    if (canUseStorage()) {
        try {
            localStorage.setItem(storageKey, JSON.stringify(next))
        } catch {
            /* ignore quota */
        }
    }
    return next
}

export function readRecentConnectionIds(): string[] {
    return readIdList(WELCOME_RECENT_CONNECTIONS_STORAGE_KEY)
}

/** 写入最近使用顺序；bump epoch 供底栏刷新（欢迎页仍用 snapshot） */
export function touchRecentConnection(connectionId: string): string[] {
    const next = touchIdList(WELCOME_RECENT_CONNECTIONS_STORAGE_KEY, connectionId)
    welcomeRecentConnectionsEpoch.value += 1
    return next
}

export function readAddedConnectionIds(): string[] {
    return readIdList(WELCOME_ADDED_CONNECTIONS_STORAGE_KEY)
}

/** 新建连接成功后记录，供「最新添加」排序 */
export function touchAddedConnection(connectionId: string): string[] {
    return touchIdList(WELCOME_ADDED_CONNECTIONS_STORAGE_KEY, connectionId)
}
