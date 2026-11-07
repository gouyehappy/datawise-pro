export type {
    RedisKeyDetail,
} from '@/shared/api/redis.types'

export function parseRedisKeyFromNodeId(nodeId: string, connectionId: string): string | null {
    const prefix = `${connectionId}:redis:`
    if (!nodeId.startsWith(prefix)) return null
    const key = nodeId.slice(prefix.length)
    if (!key || key === '__empty__') return null
    return key
}

export function formatRedisTtl(ttlSeconds: number): string {
    if (ttlSeconds === -1) return 'persistent'
    if (ttlSeconds === -2) return 'missing'
    if (ttlSeconds < 60) return `${ttlSeconds}s`
    if (ttlSeconds < 3600) return `${Math.floor(ttlSeconds / 60)}m ${ttlSeconds % 60}s`
    if (ttlSeconds < 86400) {
        const hours = Math.floor(ttlSeconds / 3600)
        const minutes = Math.floor((ttlSeconds % 3600) / 60)
        return `${hours}h ${minutes}m`
    }
    const days = Math.floor(ttlSeconds / 86400)
    const hours = Math.floor((ttlSeconds % 86400) / 3600)
    return `${days}d ${hours}h`
}

export function formatRedisSize(type: string, size: number): string {
    if (type === 'string') return `${size} chars`
    return `${size} items`
}
