import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'
import type {AiAnalysisResult, AiAnalysisStepEvent} from '@/features/ai/types/analysis'
import type {AiAssistantReference} from '@/features/ai/chat/utils/assistant-references'

export interface AiChatMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    time: string
    kind?: 'welcome'
    analysis?: AiAnalysisResult
    /** Persisted workflow steps for analysis replies (shown collapsed on the report). */
    analysisSteps?: AiAnalysisStepEvent[]
    /** Model reasoning / &lt;think&gt; text, or analysis pipeline transcript. */
    thinking?: string
    /**
     * Where `thinking` came from — drives the disclosure label.
     * `model` = LLM reasoning / think tags; `pipeline` = analysis step log.
     */
    thinkingSource?: 'model' | 'pipeline'
    /** URL refs extracted from the assistant reply. */
    references?: AiAssistantReference[]
    /** Ephemeral: token stream in progress (not persisted). */
    streaming?: boolean
    databases?: Pick<
        AiDatabaseTarget,
        'id' | 'connectionLabel' | 'databaseLabel' | 'tableLabel' | 'dbType' | 'level'
    >[]
}

export type MessageBlock =
    | { type: 'text'; text: string }
    | { type: 'code'; code: string }
    | { type: 'list'; items: string[] }
