import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    AI_ANALYSIS_QUICK_DISABLED_STEPS,
    detectAnalysisModeFromDisabled,
    disabledStepsForMode,
    expandDisabledStepIds,
    formatStepRouteMessage,
    isAnalysisStepSkipped,
    isStepCancelledByEarlierFailure,
    isStepEventStale,
    isStepHiddenFromProgress,
    normalizeAnalysisMode,
    reconcileTerminalAnalysisSteps,
    stripDisabledAnalysisArtifacts,
    visibleAnalysisStepOrder,
} from '@/features/ai/analysis/services/analysis-step.service'
import type {AiAnalysisStepEvent, AiChatReplyPayload} from '@/features/ai/types/analysis'

describe('analysis-step.service', () => {
    it('normalizes analysis mode', () => {
        assert.equal(normalizeAnalysisMode('quick'), 'quick')
        assert.equal(normalizeAnalysisMode('invalid'), 'smart')
    })

    it('detects legacy disabled lists', () => {
        assert.equal(detectAnalysisModeFromDisabled([...AI_ANALYSIS_QUICK_DISABLED_STEPS]), 'quick')
        assert.equal(detectAnalysisModeFromDisabled([]), 'smart')
        assert.equal(detectAnalysisModeFromDisabled(['chart']), 'custom')
    })

    it('returns quick disabled steps only for quick mode', () => {
        assert.deepEqual(disabledStepsForMode('quick'), [...AI_ANALYSIS_QUICK_DISABLED_STEPS])
        assert.deepEqual(disabledStepsForMode('smart'), [])
        assert.deepEqual(disabledStepsForMode('custom'), [])
    })

    it('expands python alias', () => {
        const expanded = expandDisabledStepIds(['python', 'chart'])
        assert.equal(expanded.has('python_generate'), true)
        assert.equal(expanded.has('chart'), true)
    })

    it('hides disabled steps after step_route resolves', () => {
        const steps: AiAnalysisStepEvent[] = [
            {step: 'intent', status: 'ok', message: 'done'},
            {
                step: 'step_route',
                status: 'ok',
                message: '只需 SQL 与摘要',
                detail: {disabledSteps: ['planner', 'evidence', 'python', 'chart']},
            },
            {step: 'schema', status: 'ok', message: 'done'},
        ]

        const visible = visibleAnalysisStepOrder(steps)

        assert.deepEqual(visible, [
            'intent',
            'step_route',
            'schema',
            'sql_generate',
            'sql_validate',
            'sql_execute',
            'summary',
            'report',
        ])
        assert.equal(isStepHiddenFromProgress('planner', steps), true)
        assert.equal(isStepHiddenFromProgress('python_generate', steps), true)
    })

    it('hides bypassed python chain when later steps completed', () => {
        const steps: AiAnalysisStepEvent[] = [
            {
                step: 'step_route',
                status: 'ok',
                message: 'route',
                detail: {disabledSteps: ['chart']},
            },
            {step: 'sql_execute', status: 'ok', message: 'done'},
            {step: 'summary', status: 'ok', message: 'done', durationMs: 100},
        ]

        assert.equal(isStepHiddenFromProgress('python_generate', steps), true)
        assert.equal(visibleAnalysisStepOrder(steps).includes('python_generate'), false)
    })

    it('formats step_route message with skipped step labels', () => {
        const event: AiAnalysisStepEvent = {
            step: 'step_route',
            status: 'ok',
            message: '任务只需 SQL',
            detail: {disabledSteps: ['planner', 'python']},
        }

        const message = formatStepRouteMessage(event, (id) => `L:${id}`, '跳过：')
        assert.equal(message, '任务只需 SQL\n跳过：L:planner、L:python')
    })

    it('strips chart from result when chart step skipped', () => {
        const steps: AiAnalysisStepEvent[] = [
            {
                step: 'step_route',
                status: 'ok',
                message: 'route',
                detail: {disabledSteps: ['chart']},
            },
        ]
        const result: AiChatReplyPayload = {
            reply: 'ok',
            mode: 'analysis',
            sql: 'select 1',
            chart: {
                type: 'line',
                title: 't',
                xField: 'x',
                yFields: ['y'],
                seriesNames: ['y'],
            },
        }

        const sanitized = stripDisabledAnalysisArtifacts(result, steps)

        assert.equal(isAnalysisStepSkipped(steps, 'chart'), true)
        assert.equal(sanitized.chart, null)
    })

    it('marks later steps cancelled when an earlier step failed', () => {
        const steps: AiAnalysisStepEvent[] = [
            {step: 'step_route', status: 'ok', message: 'route'},
            {step: 'sql_execute', status: 'ok', message: 'done'},
            {
                step: 'chart',
                status: 'failed',
                message: '查询结果缺少可用的数值指标（共 1 行、2 列），无法生成图表',
            },
        ]

        assert.equal(isStepCancelledByEarlierFailure('summary', steps), true)
        assert.equal(isStepCancelledByEarlierFailure('chart', steps), false)
    })

    it('marks downstream steps stale when sql_generate retries after execute failure', () => {
        const steps: AiAnalysisStepEvent[] = [
            {step: 'step_route', status: 'ok', message: 'route', detail: {disabledSteps: []}},
            {step: 'sql_generate', status: 'ok', message: 'SQL 已生成'},
            {step: 'sql_validate', status: 'ok', message: 'SQL 校验通过'},
            {step: 'sql_execute', status: 'failed', message: 'Unknown column category'},
            {step: 'sql_generate', status: 'running', message: '根据表结构修正 SQL'},
        ]
        const order = visibleAnalysisStepOrder(steps)

        assert.equal(isStepEventStale('sql_validate', steps, order), true)
        assert.equal(isStepEventStale('sql_execute', steps, order), true)
        assert.equal(isStepEventStale('sql_generate', steps, order), false)
    })

    it('reconciles missing terminal steps from final analysis result', () => {
        const steps: AiAnalysisStepEvent[] = [
            {step: 'step_route', status: 'ok', message: 'route', detail: {disabledSteps: []}},
            {step: 'sql_execute', status: 'ok', message: 'done'},
        ]
        const result: AiChatReplyPayload = {
            reply: '分析完成',
            mode: 'analysis',
            sql: 'select 1',
            chart: {
                type: 'bar',
                title: 't',
                xField: 'x',
                yFields: ['y'],
                seriesNames: ['y'],
            },
            report: {markdown: '# report'},
        }

        const reconciled = reconcileTerminalAnalysisSteps(steps, result)

        assert.equal(reconciled.some((s) => s.step === 'chart' && s.status === 'ok'), true)
        assert.equal(reconciled.some((s) => s.step === 'summary' && s.status === 'ok'), true)
        assert.equal(reconciled.some((s) => s.step === 'report' && s.status === 'ok'), true)
    })
})
