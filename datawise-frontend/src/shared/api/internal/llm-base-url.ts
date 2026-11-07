/** Spring AI 会自动追加 /v1/chat/completions，baseUrl 不应含 /v1 或完整路径 */
export function normalizeLlmBaseUrl(baseUrl: string): string {
    let trimmed = baseUrl.trim()
    if (!trimmed) return trimmed

    trimmed = trimmed.replace(/\/+$/, '')
    if (trimmed.endsWith('/chat/completions')) {
        trimmed = trimmed.slice(0, -'/chat/completions'.length).replace(/\/+$/, '')
    }
    if (trimmed.endsWith('/v1')) {
        trimmed = trimmed.slice(0, -'/v1'.length).replace(/\/+$/, '')
    }
    return trimmed
}
