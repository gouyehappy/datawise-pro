import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {isAnalysisPrompt} from '@/features/ai/analysis/utils/analysis-intent'
import {buildAnalysisContextFromMessages} from '@/features/ai/analysis/utils/analysis-context'
import type {AiChatMessage} from '@/features/ai/types/messages'

describe('analysis follow-up context', () => {
    const prior = {previousSql: 'SELECT month, SUM(amount) FROM sales GROUP BY month'}

    it('routes follow-up prompts when prior analysis exists', () => {
        assert.equal(isAnalysisPrompt('\u53ea\u8981 Q1', true, prior), true)
        assert.equal(isAnalysisPrompt('\u6362\u6210\u67f1\u72b6\u56fe', true, prior), true)
    })

    it('ignores follow-up prompts without prior analysis', () => {
        assert.equal(isAnalysisPrompt('\u53ea\u8981 Q1', true), false)
    })

    it('extracts latest assistant analysis from session messages', () => {
        const messages: AiChatMessage[] = [
            {
                id: '1',
                role: 'assistant',
                content: 'older',
                time: '10:00',
                analysis: {sql: 'SELECT 1', columns: [], rows: []},
            },
            {
                id: '2',
                role: 'user',
                content: '\u8ffd\u95ee',
                time: '10:01',
            },
            {
                id: '3',
                role: 'assistant',
                content: '\u6700\u65b0\u6458\u8981',
                time: '10:02',
                analysis: {
                    sql: 'SELECT month, total FROM sales',
                    columns: [],
                    rows: [],
                    chart: {type: 'line', title: 't', xField: 'month', yFields: ['total'], seriesNames: ['total']},
                },
            },
        ]

        assert.deepEqual(buildAnalysisContextFromMessages(messages), {
            previousSql: 'SELECT month, total FROM sales',
            previousSummary: '\u6700\u65b0\u6458\u8981',
            previousChartType: 'line',
        })
    })
})
