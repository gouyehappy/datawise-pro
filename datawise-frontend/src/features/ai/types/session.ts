import type {AiChatMessage} from '@/features/ai/types/messages'

/** Ask = explain only; Agent = may drive tools / analysis (T-AI-1). */
export type AiChatMode = 'ask' | 'agent'

/** Conversation namespace — fixed at create/seed; does not follow focus Tab. */
export interface AiConversationBinding {
    connectionId: string
    connectionName?: string
    database?: string
    schema?: string
    dialect?: string
    environment?: string
    source: 'workbench_focus' | 'tagged_scope' | 'manual' | 'editor_send'
}

export interface AiChatSession {
    id: string
    title: string
    createdAt: number
    updatedAt: number
    messages: AiChatMessage[]
    selectedTargetIds: string[]
    /** Default agent for workbench; ask for light Q&A. */
    mode: AiChatMode
    /** Bound target namespace; optional until first seed. */
    binding?: AiConversationBinding
}
