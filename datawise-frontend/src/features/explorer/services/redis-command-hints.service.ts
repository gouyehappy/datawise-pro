export interface RedisCommandHint {
    command: string
    summary: string
    example: string
}

export const REDIS_QUICK_COMMANDS = ['PING', 'INFO', 'DBSIZE', 'CLIENT LIST'] as const

export const REDIS_COMMAND_HINTS: RedisCommandHint[] = [
    {command: 'PING', summary: 'ping', example: 'PING'},
    {command: 'GET', summary: 'getString', example: 'GET mykey'},
    {command: 'SET', summary: 'setString', example: 'SET mykey value'},
    {command: 'DEL', summary: 'del', example: 'DEL mykey'},
    {command: 'EXISTS', summary: 'exists', example: 'EXISTS mykey'},
    {command: 'TTL', summary: 'ttl', example: 'TTL mykey'},
    {command: 'TYPE', summary: 'type', example: 'TYPE mykey'},
    {command: 'DBSIZE', summary: 'dbsize', example: 'DBSIZE'},
    {command: 'INFO', summary: 'info', example: 'INFO'},
    {command: 'SCAN', summary: 'scan', example: 'SCAN 0 MATCH user:* COUNT 50'},
    {command: 'HGET', summary: 'hget', example: 'HGET hash field'},
    {command: 'HGETALL', summary: 'hgetall', example: 'HGETALL hash'},
    {command: 'LRANGE', summary: 'lrange', example: 'LRANGE list 0 10'},
    {command: 'SMEMBERS', summary: 'smembers', example: 'SMEMBERS set'},
    {command: 'ZRANGE', summary: 'zrange', example: 'ZRANGE zset 0 10'},
]

export function matchRedisCommandHints(input: string, limit = 6): RedisCommandHint[] {
    const trimmed = input.trim()
    if (!trimmed) return REDIS_COMMAND_HINTS.slice(0, limit)
    const token = trimmed.split(/\s+/)[0]?.toUpperCase() ?? ''
    if (!token) return REDIS_COMMAND_HINTS.slice(0, limit)
    return REDIS_COMMAND_HINTS.filter((hint) => hint.command.startsWith(token)).slice(0, limit)
}

export function findRedisCommandHint(input: string): RedisCommandHint | null {
    const token = input.trim().split(/\s+/)[0]?.toUpperCase() ?? ''
    if (!token) return null
    return REDIS_COMMAND_HINTS.find((hint) => hint.command === token) ?? null
}

export function buildRedisGetCommand(key: string): string {
    return `GET ${quoteRedisArg(key)}`
}

export function buildRedisTtlCommand(key: string): string {
    return `TTL ${quoteRedisArg(key)}`
}

export function buildRedisTypeCommand(key: string): string {
    return `TYPE ${quoteRedisArg(key)}`
}

export function buildRedisDelCommand(key: string): string {
    return `DEL ${quoteRedisArg(key)}`
}

export function quoteRedisArg(value: string): string {
    if (!value) return '""'
    if (/^[A-Za-z0-9_:.-]+$/.test(value)) return value
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function normalizeRedisKeyType(type: string | null | undefined): string | null {
    if (!type?.trim()) return null
    return type.trim().toLowerCase()
}

/** 根据 Key 类型生成顶部快捷命令 */
export function buildRedisQuickCommandsForKey(key: string, type?: string | null): readonly string[] {
    const quoted = quoteRedisArg(key)
    const keyType = normalizeRedisKeyType(type)

    switch (keyType) {
        case 'string':
            return [`GET ${quoted}`, `STRLEN ${quoted}`, `TTL ${quoted}`, `TYPE ${quoted}`, `DEL ${quoted}`]
        case 'hash':
            return [`HGETALL ${quoted}`, `HLEN ${quoted}`, `HKEYS ${quoted}`, `TTL ${quoted}`, `TYPE ${quoted}`]
        case 'list':
            return [`LRANGE ${quoted} 0 10`, `LLEN ${quoted}`, `LINDEX ${quoted} 0`, `TTL ${quoted}`, `TYPE ${quoted}`]
        case 'set':
            return [`SMEMBERS ${quoted}`, `SCARD ${quoted}`, `TTL ${quoted}`, `TYPE ${quoted}`, `DEL ${quoted}`]
        case 'zset':
            return [`ZRANGE ${quoted} 0 10`, `ZCARD ${quoted}`, `ZREVRANGE ${quoted} 0 10`, `TTL ${quoted}`, `TYPE ${quoted}`]
        case 'stream':
            return [`XRANGE ${quoted} - + COUNT 10`, `XLEN ${quoted}`, `XINFO STREAM ${quoted}`, `TTL ${quoted}`, `TYPE ${quoted}`]
        default:
            return [`TYPE ${quoted}`, `TTL ${quoted}`, `GET ${quoted}`, 'DBSIZE', 'PING']
    }
}

/** 输入框占位：优先展示该类型最常用的读命令 */
export function buildRedisPlaceholderForKey(key: string, type?: string | null): string {
    const quoted = quoteRedisArg(key)
    switch (normalizeRedisKeyType(type)) {
        case 'hash':
            return `HGETALL ${quoted}`
        case 'list':
            return `LRANGE ${quoted} 0 10`
        case 'set':
            return `SMEMBERS ${quoted}`
        case 'zset':
            return `ZRANGE ${quoted} 0 10`
        case 'stream':
            return `XRANGE ${quoted} - + COUNT 10`
        case 'string':
            return `GET ${quoted}`
        default:
            return `TYPE ${quoted}`
    }
}

export function resolveRedisKeyIdleHintKey(type?: string | null): string {
    switch (normalizeRedisKeyType(type)) {
        case 'string':
            return 'keyHintString'
        case 'hash':
            return 'keyHintHash'
        case 'list':
            return 'keyHintList'
        case 'set':
            return 'keyHintSet'
        case 'zset':
            return 'keyHintZset'
        case 'stream':
            return 'keyHintStream'
        default:
            return 'keyHintUnknown'
    }
}
