import {describe, expect, it} from 'vitest'
import {formatAnalysisStepsAsThinking} from './analysis-thinking.service'
import type {AiAnalysisStepEvent} from '@/features/ai/types/analysis'

describe('formatAnalysisStepsAsThinking', () => {
    it('formats step status marks with title and detail', () => {
        const steps: AiAnalysisStepEvent[] = [
            {step: 'planner', status: 'ok', message: 'Chose SQL path'},
            {step: 'sql_generate', status: 'running', message: 'Drafting query'},
            {step: 'sql_execute', status: 'failed', message: 'Timeout'},
        ]
        expect(
            formatAnalysisStepsAsThinking(steps, {
                labelForStep: (id) =>
                    ({
                        planner: '规划分析路径',
                        sql_generate: '生成 SQL',
                        sql_execute: '执行查询',
                    })[id] || id,
            }),
        ).toBe(
            '✓ 规划分析路径 — Chose SQL path\n… 生成 SQL — Drafting query\n✗ 执行查询 — Timeout',
        )
    })

    it('avoids duplicating identical title and detail', () => {
        expect(
            formatAnalysisStepsAsThinking(
                [{step: 'summary', status: 'ok', message: '生成摘要'}],
                {labelForStep: () => '生成摘要'},
            ),
        ).toBe('✓ 生成摘要')
    })

    it('skips empty labels', () => {
        expect(
            formatAnalysisStepsAsThinking([
                {step: '', status: 'ok', message: ''},
                {step: 'done', status: 'ok', message: 'Done'},
            ]),
        ).toBe('✓ done — Done')
    })
})
