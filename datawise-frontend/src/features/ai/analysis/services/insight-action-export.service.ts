import type {CreateInsightActionRequest} from '@/shared/api/types'

const DEFAULT_TITLE = 'AI insight'
const TITLE_MAX_LENGTH = 120

export interface BuildInsightActionFromAiMessageInput {
    reply: string
    sql?: string | null
    sessionId?: string | null
    defaultTitle?: string
}

function firstNonEmptyLine(text: string): string {
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed) return trimmed
    }
    return ''
}

function truncateTitle(title: string, maxLength = TITLE_MAX_LENGTH): string {
    const trimmed = title.trim()
    if (trimmed.length <= maxLength) return trimmed
    return `${trimmed.slice(0, maxLength - 1)}…`
}

function sqlAlreadyInBody(body: string, sql: string): boolean {
    if (body.includes(sql)) return true
    return /```(?:sql)?[\s\S]*?```/i.test(body)
}

export function buildInsightActionBody(reply: string, sql?: string | null): string {
    const trimmedReply = reply.trim()
    const trimmedSql = sql?.trim()
    if (!trimmedSql) return trimmedReply
    if (sqlAlreadyInBody(trimmedReply, trimmedSql)) return trimmedReply
    const fenced = `\`\`\`sql\n${trimmedSql}\n\`\`\``
    return trimmedReply ? `${trimmedReply}\n\n${fenced}` : fenced
}

export function buildInsightActionFromAiMessage(
    input: BuildInsightActionFromAiMessageInput,
): CreateInsightActionRequest {
    const fallbackTitle = input.defaultTitle?.trim() || DEFAULT_TITLE
    const firstLine = firstNonEmptyLine(input.reply)
    const title = firstLine ? truncateTitle(firstLine) : fallbackTitle
    const body = buildInsightActionBody(input.reply, input.sql)
    const data: Record<string, unknown> = {
        source: 'ai-workbench',
        mode: 'analysis',
    }
    const sessionId = input.sessionId?.trim()
    if (sessionId) {
        data.sessionId = sessionId
    }
    return {title, body, data}
}
