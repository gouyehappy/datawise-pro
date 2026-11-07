export interface ChatMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export function resolveChatCompletionsUrl(baseUrl: string): string {
    const trimmed = baseUrl.replace(/\/+$/, '')
    if (trimmed.endsWith('/chat/completions')) return trimmed
    if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`
    return `${trimmed}/v1/chat/completions`
}

export async function chatCompletion(options: {
    baseUrl: string
    apiKey: string
    model: string
    messages: ChatMessage[]
    signal?: AbortSignal
}): Promise<string> {
    const url = resolveChatCompletionsUrl(options.baseUrl)
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
            model: options.model,
            messages: options.messages,
            temperature: 0.2,
        }),
        signal: options.signal,
    })

    if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(body || `HTTP ${response.status}`)
    }

    const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('Empty model response')
    return content
}

export function stripSqlCodeFence(text: string): string {
    const trimmed = text.trim()
    const fenced = trimmed.match(/^```(?:sql)?\s*([\s\S]*?)```$/i)
    if (fenced) return fenced[1]!.trim()
    return trimmed.replace(/^```(?:sql)?\s*/i, '').replace(/```\s*$/i, '').trim()
}

export function stripPlainTextFence(text: string): string {
    const trimmed = text.trim()
    const fenced = trimmed.match(/^```(?:\w+)?\s*([\s\S]*?)```$/i)
    if (fenced) return fenced[1]!.trim()
    return trimmed.replace(/^```(?:\w+)?\s*/i, '').replace(/```\s*$/i, '').trim()
}
