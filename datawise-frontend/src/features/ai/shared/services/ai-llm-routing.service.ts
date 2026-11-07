import type {AiAnalysisLlmRouteStep} from '@/shared/config/app-config.types'
import type {AiPreferences} from '@/shared/config/app-config.types'
import {
    resolveWorkbenchAiLlmProfile,
    toAiLlmProfilePayload,
    type AiLlmProfilePayload,
} from '@/api'

export const AI_LLM_ROUTE_STEPS: AiAnalysisLlmRouteStep[] = [
    'planning',
    'sql',
    'python',
    'summary',
]

export function buildAnalysisStepLlms(prefs: AiPreferences): Record<string, AiLlmProfilePayload> {
    const fallback = resolveWorkbenchAiLlmProfile(prefs)
    const routes = prefs.analysisStepLlmIds ?? {}
    const stepLlms: Record<string, AiLlmProfilePayload> = {}

    for (const step of AI_LLM_ROUTE_STEPS) {
        const profileId = routes[step]
        if (!profileId) continue
        const profile = prefs.llmProfiles.find((item) => item.id === profileId)
        if (!profile || profile.id === fallback.id) continue
        stepLlms[step] = toAiLlmProfilePayload(profile)
    }

    return stepLlms
}
