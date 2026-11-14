import {t} from '@/i18n'
import type {AiAnalysisErrorPayload} from '@/shared/api/ai.types'
import {HTTP_TIMEOUT} from '@/shared/api/http/request'

export type {AiAnalysisErrorPayload}

const EMPTY_RESPONSE_MARKERS = new Set([
    'empty ai response',
    'empty ai migration response',
    'no index suggestions',
])

/** 将 AI / LLM 调用异常转为可展示的 Toast 文案 */
export function formatAiErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim() === HTTP_TIMEOUT) {
        return t('ai.generateTimedOut')
    }
    if (error instanceof Error && error.message.trim()) {
        const detail = error.message.trim()
        if (EMPTY_RESPONSE_MARKERS.has(detail.toLowerCase())) {
            return t('ai.emptyResponse')
        }
        // Prefer generic product copy over raw English exception detail.
        if (/^[A-Z][A-Z0-9_]{2,}$/.test(detail) || /\bException\b|\bError:\s/i.test(detail)) {
            return t('ai.generateFailedGeneric')
        }
        return t('ai.generateFailed', {detail})
    }
    return t('ai.generateFailedGeneric')
}

/** 将 SSE analysis error 事件映射为可读文案（优先稳定 error code） */
export function formatAiAnalysisStreamError(payload: AiAnalysisErrorPayload): string {
    const code = payload.code?.trim()
    if (code) {
        const key = `ai.errors.${code}`
        const translated = t(key)
        if (translated !== key) {
            return translated
        }
    }
    const message = payload.message?.trim()
    if (message) {
        if (EMPTY_RESPONSE_MARKERS.has(message.toLowerCase())) {
            return t('ai.emptyResponse')
        }
        if (/^[A-Z][A-Z0-9_]{2,}$/.test(message)) {
            return t('ai.generateFailedGeneric')
        }
        return message
    }
    return t('ai.generateFailedGeneric')
}
