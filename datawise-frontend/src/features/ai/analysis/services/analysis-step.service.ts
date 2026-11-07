import {
    AI_ANALYSIS_STEP_ORDER,
    type AiAnalysisMode,
    type AiAnalysisStepEvent,
    type AiAnalysisStepId,
    type AiAnalysisConfigurableStepId,
    type AiChatReplyPayload,
} from '@/shared/api/ai.types'
import {
    AI_ANALYSIS_QUICK_DISABLED_STEPS,
    disabledStepsForMode,
    isValidAnalysisMode,
    normalizeAnalysisMode,
} from '@/shared/api/ai-analysis-mode'
import {t} from '@/i18n'

export type {AiAnalysisMode}
export {
    AI_ANALYSIS_QUICK_DISABLED_STEPS,
    disabledStepsForMode,
    isValidAnalysisMode,
    normalizeAnalysisMode,
}

const PYTHON_CHAIN: AiAnalysisStepId[] = ['python_generate', 'python_execute', 'python_analyze']

/** 迁移旧配置：从 disabled 列表推断模式 */
export function detectAnalysisModeFromDisabled(
    disabled: readonly string[] | undefined,
): AiAnalysisMode | 'custom' {
    const quick = AI_ANALYSIS_QUICK_DISABLED_STEPS
    const a = new Set(disabled ?? [])
    const b = new Set(quick)
    if (a.size === b.size && quick.every((step) => a.has(step))) return 'quick'
    if (a.size === 0) return 'smart'
    return 'custom'
}

// --- 进度可见性（隐藏当次不执行的步骤） ---

export function expandDisabledStepIds(disabled: string[]): Set<string> {
    const set = new Set<string>()
    for (const raw of disabled) {
        const id = raw.trim().toLowerCase().replace(/-/g, '_')
        if (!id) continue
        if (id === 'python') {
            PYTHON_CHAIN.forEach((step) => set.add(step))
        } else {
            set.add(id)
        }
    }
    return set
}

export function resolveRunDisabledStepIds(steps: AiAnalysisStepEvent[]): Set<string> {
    const route = steps.find((step) => step.step === 'step_route' && step.status === 'ok')
    const disabled = route?.detail?.disabledSteps
    if (!Array.isArray(disabled)) return new Set()
    return expandDisabledStepIds(disabled.map(String))
}

function isStepRouteResolved(steps: AiAnalysisStepEvent[]): boolean {
    return steps.some((step) => step.step === 'step_route' && step.status === 'ok')
}

function isBypassedWithoutEvent(stepId: AiAnalysisStepId, steps: AiAnalysisStepEvent[]): boolean {
    const event = steps.find((step) => step.step === stepId)
    if (event) return false

    const index = AI_ANALYSIS_STEP_ORDER.indexOf(stepId)
    if (index < 0) return false

    return AI_ANALYSIS_STEP_ORDER.slice(index + 1).some((laterId) => {
        const later = steps.find((step) => step.step === laterId)
        return later?.status === 'ok' || later?.status === 'failed'
    })
}

/** 当次不执行的步骤：不在进度列表展示，由 step_route 统一说明 */
export function isStepHiddenFromProgress(
    stepId: AiAnalysisStepId,
    steps: AiAnalysisStepEvent[],
): boolean {
    const event = steps.find((step) => step.step === stepId)
    if (event?.status === 'skipped') return true
    if (resolveRunDisabledStepIds(steps).has(stepId)) return true
    return isBypassedWithoutEvent(stepId, steps)
}

/** 进度面板展示的步骤顺序（路由完成前仅显示至 step_route） */
export function visibleAnalysisStepOrder(steps: AiAnalysisStepEvent[]): AiAnalysisStepId[] {
    const routeResolved = isStepRouteResolved(steps)
    const routeIndex = AI_ANALYSIS_STEP_ORDER.indexOf('step_route')

    return AI_ANALYSIS_STEP_ORDER.filter((stepId, index) => {
        if (!routeResolved) return index <= routeIndex
        return !isStepHiddenFromProgress(stepId, steps)
    })
}

export function formatStepRouteMessage(
    event: AiAnalysisStepEvent | undefined,
    labelFor: (stepId: string) => string,
    skippedPrefix: string,
): string {
    if (!event?.message) return ''
    const disabled = event.detail?.disabledSteps
    if (!Array.isArray(disabled) || disabled.length === 0) return event.message

    const labels: string[] = []
    const seen = new Set<string>()
    for (const raw of disabled) {
        const id = String(raw).trim().toLowerCase().replace(/-/g, '_')
        if (!id || seen.has(id)) continue
        seen.add(id)
        labels.push(labelFor(id))
    }
    if (!labels.length) return event.message
    return `${event.message}\n${skippedPrefix}${labels.join('、')}`
}

export function isAnalysisStepSkipped(
    steps: AiAnalysisStepEvent[],
    stepId: AiAnalysisStepId,
): boolean {
    if (isStepHiddenFromProgress(stepId, steps)) return true
    return steps.some((step) => step.step === stepId && step.status === 'skipped')
}

/** 某步骤之前已有 failed 事件时，后续未执行步骤应视为已取消 */
export function isStepCancelledByEarlierFailure(
    stepId: AiAnalysisStepId,
    steps: AiAnalysisStepEvent[],
): boolean {
    const order = visibleAnalysisStepOrder(steps)
    const index = order.indexOf(stepId)
    if (index <= 0) return false
    return order.slice(0, index).some((earlierId) => {
        const earlier = steps.find((step) => step.step === earlierId)
        return earlier?.status === 'failed'
    })
}

/** 某步骤在事件流中最后一次出现的索引 */
export function lastStepEventIndex(steps: AiAnalysisStepEvent[], stepId: AiAnalysisStepId): number {
    let idx = -1
    for (let i = 0; i < steps.length; i++) {
        if (steps[i].step === stepId) idx = i
    }
    return idx
}

/**
 * 执行失败后回到 sql_generate 重试时，较早轮次的 ok/failed 事件已过时，
 * 不应与新一轮「生成 SQL 进行中」同时展示。
 */
export function isStepEventStale(
    stepId: AiAnalysisStepId,
    steps: AiAnalysisStepEvent[],
    visibleOrder: readonly AiAnalysisStepId[],
): boolean {
    const eventIdx = lastStepEventIndex(steps, stepId)
    if (eventIdx < 0) return false

    const stepIndex = visibleOrder.indexOf(stepId)
    if (stepIndex <= 0) return false

    for (let i = 0; i < stepIndex; i++) {
        const priorIdx = lastStepEventIndex(steps, visibleOrder[i])
        if (priorIdx > eventIdx) return true
    }
    return false
}

/** chart 等步骤被跳过时，剥离结果中的对应产物 */
export function stripDisabledAnalysisArtifacts(
    result: AiChatReplyPayload,
    steps: AiAnalysisStepEvent[],
): AiChatReplyPayload {
    if (!isAnalysisStepSkipped(steps, 'chart')) {
        return result
    }
    return {...result, chart: null}
}

function hasRenderableReport(result: AiChatReplyPayload): boolean {
    return Boolean(result.report?.markdown?.trim() || result.report?.html?.trim())
}

function hasStepEvent(steps: AiAnalysisStepEvent[], stepId: AiAnalysisStepId): boolean {
    return steps.some((step) => step.step === stepId)
}

function fallbackOkEvent(stepId: AiAnalysisStepId, message: string): AiAnalysisStepEvent {
    return {
        step: stepId,
        status: 'ok',
        message,
        durationMs: 0,
        detail: {fallback: true},
    }
}

/**
 * 修复「结果已返回但尾部步骤仍显示等待」：
 * 若最终结果已包含产物，而 step 事件缺失，则补一个兜底 ok 事件。
 */
export function reconcileTerminalAnalysisSteps(
    steps: AiAnalysisStepEvent[],
    result: AiChatReplyPayload,
): AiAnalysisStepEvent[] {
    const next = [...steps]

    if (result.mode !== 'analysis') return next

    if (result.chart && !isAnalysisStepSkipped(next, 'chart') && !hasStepEvent(next, 'chart')) {
        next.push(fallbackOkEvent('chart', t('ai.analysis.stepFallback.chart')))
    }
    if (result.reply?.trim() && !isAnalysisStepSkipped(next, 'summary') && !hasStepEvent(next, 'summary')) {
        next.push(fallbackOkEvent('summary', t('ai.analysis.stepFallback.summary')))
    }
    if (hasRenderableReport(result) && !isAnalysisStepSkipped(next, 'report') && !hasStepEvent(next, 'report')) {
        next.push(fallbackOkEvent('report', t('ai.analysis.stepFallback.report')))
    }

    return next
}
