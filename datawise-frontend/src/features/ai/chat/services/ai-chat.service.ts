import {renderSafeMarkdown} from '@/core/markdown/safe-markdown'
import type {AiChatMessage} from '@/features/ai/types'
import {i18n} from '@/i18n'

export type {AiChatMessage, MessageBlock} from '@/features/ai/types'

/** Markdown prose + fenced code surfaces for assistant bubbles. */
export type AssistantRenderBlock =
    | {type: 'md'; html: string}
    | {type: 'code'; code: string; lang: string}

/**
 * Split assistant reply into markdown HTML chunks and fenced code blocks
 * so SQL fences can keep the "open in console" chrome.
 */
export function buildAssistantRenderBlocks(content: string): AssistantRenderBlock[] {
    const parts = content.split(/(```[\s\S]*?```)/g)
    const blocks: AssistantRenderBlock[] = []

    for (const part of parts) {
        if (!part) continue
        if (part.startsWith('```') && part.endsWith('```')) {
            const inner = part.slice(3, -3)
            const newline = inner.indexOf('\n')
            const lang = (newline >= 0 ? inner.slice(0, newline) : '').trim().toLowerCase()
            const code = (newline >= 0 ? inner.slice(newline + 1) : inner).replace(/\n$/, '')
            blocks.push({type: 'code', code, lang})
            continue
        }
        const html = renderSafeMarkdown(part)
        if (html) blocks.push({type: 'md', html})
    }

    if (!blocks.length) {
        const html = renderSafeMarkdown(content)
        if (html) blocks.push({type: 'md', html})
    }
    return blocks
}

function looksLikeSql(code: string, lang: string): boolean {
    if (lang === 'sql' || lang === 'mysql' || lang === 'postgresql' || lang === 'pgsql') return true
    return /^(?:--|WITH|SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|EXPLAIN|SHOW|DESCRIBE|USE)\b/i.test(
        code.trim(),
    )
}

export function isAssistantSqlCodeBlock(block: Extract<AssistantRenderBlock, {type: 'code'}>): boolean {
    return looksLikeSql(block.code, block.lang)
}

const DOCUMENT_FENCE_LANGS = new Set(['', 'md', 'markdown', 'text', 'plaintext', 'txt'])

/** Non-SQL fences that look like a document body (for "apply to file"). */
export function isAssistantDocumentCodeBlock(
    block: Extract<AssistantRenderBlock, {type: 'code'}>,
): boolean {
    if (isAssistantSqlCodeBlock(block)) return false
    if (DOCUMENT_FENCE_LANGS.has(block.lang)) return block.code.trim().length > 0
    // Large unlabeled / other fences (e.g. model forgot the lang tag)
    return block.code.trim().length >= 400
}

function parseFencedBlocks(content: string): Array<{lang: string; code: string}> {
    const fences: Array<{lang: string; code: string}> = []
    const parts = content.split(/(```[\s\S]*?```)/g)
    for (const part of parts) {
        if (!part.startsWith('```') || !part.endsWith('```')) continue
        const inner = part.slice(3, -3)
        const newline = inner.indexOf('\n')
        const lang = (newline >= 0 ? inner.slice(0, newline) : '').trim().toLowerCase()
        const code = (newline >= 0 ? inner.slice(newline + 1) : inner).replace(/\n$/, '')
        fences.push({lang, code})
    }
    return fences
}

/**
 * Document body from an assistant reply for writing back to a local MD/text tab.
 * When the model splits the rewrite into several document fences, join them in order
 * (never "largest fence only" — that overwrites the file with a fragment).
 */
export function extractDocumentFromContent(content: string): string | null {
    const trimmed = content.trim()
    if (!trimmed) return null

    const fences = parseFencedBlocks(trimmed)
    const docFences = fences.filter((fence) =>
        isAssistantDocumentCodeBlock({type: 'code', ...fence}),
    )
    if (docFences.length > 1) {
        const joined = docFences
            .map((fence) => fence.code.replace(/\n$/, '').trimEnd())
            .filter(Boolean)
            .join('\n\n')
            .trim()
        if (joined) return joined
    }
    if (docFences.length === 1 && docFences[0].code.trim()) {
        return docFences[0].code.replace(/\n$/, '')
    }

    // Reply rendered as markdown (no outer fence) — typical for full-doc rewrites.
    if (trimmed.length >= 80) return trimmed
    return null
}

/** 将助手回复拆成文本、列表与代码块，便于渲染 */
export function parseMessageBlocks(content: string) {
    const blocks: import('@/features/ai/types').MessageBlock[] = []
    const parts = content.split(/(```[\s\S]*?```)/g)

    for (const part of parts) {
        if (!part) continue

        if (part.startsWith('```') && part.endsWith('```')) {
            blocks.push({type: 'code', code: part.replace(/```/g, '').trim()})
            continue
        }

        const lines = part.split('\n')
        let textBuffer: string[] = []
        let listBuffer: string[] = []

        const flushText = () => {
            const text = textBuffer.join('\n').trim()
            if (text) blocks.push({type: 'text', text})
            textBuffer = []
        }

        const flushList = () => {
            if (listBuffer.length) blocks.push({type: 'list', items: [...listBuffer]})
            listBuffer = []
        }

        for (const line of lines) {
            const listMatch = line.match(/^\s*[-•]\s+(.*)$/)
            if (listMatch) {
                flushText()
                listBuffer.push(listMatch[1])
                continue
            }

            if (listBuffer.length) flushList()
            textBuffer.push(line)
        }

        flushList()
        flushText()
    }

    if (!blocks.length) blocks.push({type: 'text', text: content})
    return blocks
}

function nowTime() {
    return new Date().toLocaleTimeString(i18n.global.locale.value, {hour12: false})
}

export function createUserMessage(
    content: string,
    databases?: AiChatMessage['databases'],
): AiChatMessage {
    return {id: `u-${Date.now()}`, role: 'user', content, time: nowTime(), databases}
}

export function createAssistantMessage(
    content: string,
    options?: {
        kind?: AiChatMessage['kind']
        analysis?: AiChatMessage['analysis']
        analysisSteps?: AiChatMessage['analysisSteps']
        thinking?: string
        thinkingSource?: AiChatMessage['thinkingSource']
        streaming?: boolean
        references?: AiChatMessage['references']
    },
): AiChatMessage {
    return {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content,
        time: nowTime(),
        kind: options?.kind,
        analysis: options?.analysis,
        analysisSteps: options?.analysisSteps?.length ? [...options.analysisSteps] : undefined,
        thinking: options?.thinking,
        thinkingSource: options?.thinkingSource,
        streaming: options?.streaming,
        references: options?.references,
    }
}

export function createWelcomeMessages(welcomeText: string): AiChatMessage[] {
    return [createAssistantMessage(welcomeText, {kind: 'welcome'})]
}

export function buildSessionTitle(text: string, fallback: string): string {
    const trimmed = text.trim().replace(/\s+/g, ' ')
    if (!trimmed) return fallback
    return trimmed.length > 30 ? `${trimmed.slice(0, 30)}…` : trimmed
}

/** 从助手回复中提取 SQL 片段；若已是可执行 SQL 则直接返回 */
export function extractSqlFromContent(content: string): string | null {
    const trimmed = content.trim()
    if (/^(?:--|SELECT|WITH)\b/i.test(trimmed)) {
        return trimmed
    }
    const match = trimmed.match(/```[\s\S]*?```|SELECT[\s\S]+?;/i)
    if (!match) return null
    return match[0].replace(/```/g, '').trim()
}
