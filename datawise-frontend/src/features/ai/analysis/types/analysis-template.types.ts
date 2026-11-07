import type {AiAnalysisMode} from '@/features/ai/types/analysis'

export interface AiAnalysisTemplate {
    id: string
    name: string
    prompt: string
    targetIds: string[]
    analysisMode: AiAnalysisMode
    createdAt: number
    updatedAt: number
}

export const AI_ANALYSIS_TEMPLATE_STORAGE_KEY = 'dw-cli-ai-analysis-templates'
export const AI_ANALYSIS_TEMPLATE_MAX = 30
