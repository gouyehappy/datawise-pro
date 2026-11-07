/** 规范化 Mongo find filter JSON；空串表示不过滤，非法 JSON 返回错误文案 key 用 null + message */
export function normalizeMongoDocumentFilter(
    raw: string | null | undefined,
): {filter?: string; error?: string} {
    const trimmed = raw?.trim() ?? ''
    if (!trimmed) return {}
    try {
        const parsed = JSON.parse(trimmed) as unknown
        if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {error: 'notObject'}
        }
        return {filter: JSON.stringify(parsed)}
    } catch {
        return {error: 'invalidJson'}
    }
}
