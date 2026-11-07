import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {layoutExplainPlanGraph} from '@/features/workspace/services/explain-plan-graph.service'
import {classifyExplainPlanNodeRisk} from '@/features/workspace/services/explain-plan-risk.service'
import type {ExplainPlanNode} from '@/features/workspace/types/explain-plan'

describe('explain-plan-graph.service', () => {
    it('layouts parent and child nodes with edges', () => {
        const roots: ExplainPlanNode[] = [{
            id: 'root',
            label: 'Limit',
            children: [{
                id: 'child',
                label: 'Seq Scan · users',
                metrics: {'Node Type': 'Seq Scan', 'Relation Name': 'users'},
            }],
        }]
        const layout = layoutExplainPlanGraph(roots)
        assert.equal(layout.nodes.length, 2)
        assert.equal(layout.edges.length, 1)
        assert.equal(layout.edges[0]?.fromId, 'root')
        assert.equal(layout.edges[0]?.toId, 'child')
        const child = layout.nodes.find((node) => node.id === 'child')
        assert.equal(child?.risk, 'warning')
        assert.ok(layout.width > 0)
        assert.ok(layout.height > 0)
    })
})

describe('explain-plan-risk.service', () => {
    it('flags mysql full table scan as warning', () => {
        const risk = classifyExplainPlanNodeRisk({
            id: 'n1',
            label: 'SIMPLE',
            metrics: {type: 'ALL', table: 'orders'},
        })
        assert.equal(risk.level, 'warning')
    })

    it('flags filesort as info', () => {
        const risk = classifyExplainPlanNodeRisk({
            id: 'n2',
            label: 'Sort',
            metrics: {Extra: 'Using filesort'},
        })
        assert.equal(risk.level, 'info')
    })
})
