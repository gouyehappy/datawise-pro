import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildDataQualityGateExportFilename,
    formatDataQualityGateExport,
    listDataQualityReferenceConnections,
    summarizeMultiEnvGate,
} from '@/features/platform/services/data-quality-multi-env-gate.service'
import type {TreeNode} from '@/core/types'

describe('data-quality-multi-env-gate.service', () => {
    it('lists other connections with env labels', () => {
        const tree: TreeNode[] = [
            {
                id: 'g1',
                label: 'Group',
                type: 'group',
                children: [
                    {id: 'c-prod', label: 'Prod', type: 'connection', env: 'prod'},
                    {id: 'c-stg', label: 'Staging', type: 'connection', env: 'staging'},
                ],
            },
        ]
        const options = listDataQualityReferenceConnections(tree, 'c-prod', (key) => key)
        assert.equal(options.length, 1)
        assert.equal(options[0].value, 'c-stg')
        assert.ok(options[0].label.includes('Staging'))
    })

    it('summarizes multi-env gate scopes', () => {
        const summary = summarizeMultiEnvGate({
            passed: false,
            total: 3,
            failed: 1,
            results: [],
            scopes: [
                {connectionId: 'a', database: 'db', passed: true, total: 2, failed: 0, results: []},
                {connectionId: 'b', database: 'db', passed: false, total: 1, failed: 1, results: []},
            ],
        }, (scope) => scope.connectionId ?? '?')
        assert.equal(summary.passed, false)
        assert.deepEqual(summary.summaryParts, ['a: 0/2', 'b: 1/1'])
    })

    it('includes unpaired pair count in summary', () => {
        const summary = summarizeMultiEnvGate({
            passed: false,
            total: 2,
            failed: 1,
            results: [],
            scopes: [
                {connectionId: 'a', database: 'db', passed: true, total: 1, failed: 0, results: []},
                {connectionId: 'b', database: 'db', passed: false, total: 1, failed: 1, results: []},
            ],
            pairs: [
                {name: 'No negatives', primaryRuleId: 'p1', referenceRuleId: null, paired: false},
            ],
        }, (scope) => scope.connectionId ?? '?')
        assert.equal(summary.unpaired, 1)
        assert.deepEqual(summary.summaryParts, ['a: 0/1', 'b: 1/1'])
    })

    it('formats gate export JSON', () => {
        const json = formatDataQualityGateExport({
            passed: true,
            total: 1,
            failed: 0,
            results: [],
        })
        const parsed = JSON.parse(json) as {passed: boolean; exportedAt: string}
        assert.equal(parsed.passed, true)
        assert.ok(parsed.exportedAt)
        assert.match(
            buildDataQualityGateExportFilename(
                {passed: true, total: 1, failed: 0, results: []},
                new Date('2026-07-19T12:00:00.000Z'),
            ),
            /^dq-gate-passed-2026-07-19T12-00-00\.json$/,
        )
    })
})
