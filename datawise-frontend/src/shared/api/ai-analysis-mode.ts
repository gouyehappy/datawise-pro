import type {AiAnalysisConfigurableStepId, AiAnalysisMode} from '@/shared/api/ai.types'

export type {AiAnalysisMode}

/** 快速分析：固定跳过规划/RAG/Python/图表/完整报告（与后端 AiAnalysisSteps.QUICK_DISABLED 对齐） */
export const AI_ANALYSIS_QUICK_DISABLED_STEPS: readonly AiAnalysisConfigurableStepId[] = [
    'planner',
    'evidence',
    'python',
    'chart',
    'report',
]

export function isValidAnalysisMode(mode: unknown): mode is AiAnalysisMode {
    return mode === 'quick' || mode === 'smart' || mode === 'custom'
}

export function normalizeAnalysisMode(mode: unknown): AiAnalysisMode {
    return isValidAnalysisMode(mode) ? mode : 'smart'
}

export function disabledStepsForMode(mode: AiAnalysisMode): AiAnalysisConfigurableStepId[] {
    return mode === 'quick' ? [...AI_ANALYSIS_QUICK_DISABLED_STEPS] : []
}
