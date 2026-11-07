import type {AiChatReplyPayload} from '@/shared/api/ai.types'

const ENABLED = import.meta.env.DEV

function preview(text: string | undefined | null, max = 120): string {
    if (!text) return ''
    const normalized = text.replace(/\s+/g, ' ').trim()
    return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`
}

/** 开发环境 AI 请求日志（便于对照后端 RequestLoggingFilter / AiCallLogger） */
export function logAiChatRequest(prompt: string, targetCount: number) {
    if (!ENABLED) return
    console.info('[AI] request', {prompt: preview(prompt), targetCount})
}

export function logAiChatResponse(result: AiChatReplyPayload, durationMs: number) {
    if (!ENABLED) return
    console.info('[AI] response', {
        durationMs,
        mode: result.mode ?? 'chat',
        replyChars: result.reply?.length ?? 0,
        replyPreview: preview(result.reply),
        sqlChars: result.sql?.length ?? 0,
        rowCount: result.rows?.length ?? 0,
        chartType: result.chart?.type ?? 'none',
    })
}

export function logAiChatError(error: unknown, durationMs: number) {
    if (!ENABLED) return
    console.error('[AI] failed', {durationMs, error})
}
