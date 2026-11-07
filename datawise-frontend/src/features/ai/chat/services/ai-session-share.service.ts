import type {AiChatSession} from '@/features/ai/types/session'

export interface TeamAiSessionSharePayload {
    title: string
    selectedTargetIds: string[]
    messages: AiChatSession['messages']
    sharedAt: string
}

export function buildTeamAiSessionSharePayload(session: AiChatSession): TeamAiSessionSharePayload {
    return {
        title: session.title,
        selectedTargetIds: [...session.selectedTargetIds],
        messages: session.messages.filter((message) => message.kind !== 'welcome'),
        sharedAt: new Date().toISOString(),
    }
}

export function serializeTeamAiSessionSharePayload(payload: TeamAiSessionSharePayload): string {
    return JSON.stringify(payload)
}

export function parseTeamAiSessionSharePayload(json: string): TeamAiSessionSharePayload | null {
    if (!json?.trim()) return null
    try {
        const parsed = JSON.parse(json) as Partial<TeamAiSessionSharePayload>
        if (!parsed || typeof parsed.title !== 'string' || !Array.isArray(parsed.messages)) {
            return null
        }
        return {
            title: parsed.title,
            selectedTargetIds: Array.isArray(parsed.selectedTargetIds)
                ? parsed.selectedTargetIds.filter((id): id is string => typeof id === 'string')
                : [],
            messages: parsed.messages,
            sharedAt: typeof parsed.sharedAt === 'string' ? parsed.sharedAt : new Date().toISOString(),
        }
    } catch {
        return null
    }
}
