import type {AiChatMessage} from '@/features/ai/types/messages'

export interface AiChatSession {
    id: string
    title: string
    createdAt: number
    updatedAt: number
    messages: AiChatMessage[]
    selectedTargetIds: string[]
}
