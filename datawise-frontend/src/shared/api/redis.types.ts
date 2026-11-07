/** Redis key / scan / console API DTOs. */
export interface RedisKeyDetail {
    key: string
    type: string
    ttlSeconds: number
    size: number
    preview: string
    previewTruncated: boolean
}

export interface RedisKeysScanResult {
    keys: string[]
    cursor: string
    hasMore: boolean
    dbSize: number
}

export interface RedisCommandResult {
    command: string
    output: string
    success: boolean
    error: string | null
    durationMs: number
}

export interface RedisConsoleEntry {
    command: string
    output: string
    success: boolean
    durationMs: number
}
