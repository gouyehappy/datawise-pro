import type {AiAnalysisStepEvent} from '@/features/ai/types/analysis'

export type AnalysisThinkingLabeler = (stepId: string) => string

function statusMark(status: AiAnalysisStepEvent['status']): string {
    if (status === 'failed') return '✗'
    if (status === 'running') return '…'
    if (status === 'skipped') return '–'
    return '✓'
}

/**
 * Render analysis pipeline steps as a readable transcript.
 * Prefer i18n step titles via `labelForStep`; keep server `message` as detail.
 */
export function formatAnalysisStepsAsThinking(
    steps: AiAnalysisStepEvent[],
    options?: {labelForStep?: AnalysisThinkingLabeler},
): string {
    const lines: string[] = []
    for (const step of steps) {
        const title = (options?.labelForStep?.(step.step) || step.step || '').trim()
        const detail = (step.message || '').trim()
        if (!title && !detail) continue
        const mark = statusMark(step.status)
        if (title && detail && detail !== title && !detail.startsWith(title)) {
            lines.push(`${mark} ${title} — ${detail}`)
        } else {
            lines.push(`${mark} ${detail || title}`)
        }
    }
    return lines.join('\n')
}
