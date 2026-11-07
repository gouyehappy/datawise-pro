import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {formatExplainPlanInterpretPrompt} from '@/features/workspace/services/explain-plan-ai.service'
import type {ExplainPlanNode} from '@/features/workspace/types/explain-plan'

const nodes: ExplainPlanNode[] = [
    {
        id: '1',
        label: 'Seq Scan on users',
        metrics: {'Relation Name': 'users', rows: 1000},
        children: [],
    },
]

describe('explain-plan-ai.service', () => {
    it('builds interpret prompt with sql and plan tree', () => {
        const prompt = formatExplainPlanInterpretPrompt(
            {sql: 'SELECT * FROM users', nodes, dbType: 'postgresql', explainMode: 'analyze'},
            'zh-CN',
        )
        assert.match(prompt, /Chinese/)
        assert.match(prompt, /SELECT \* FROM users/)
        assert.match(prompt, /Seq Scan on users/)
    })
})
