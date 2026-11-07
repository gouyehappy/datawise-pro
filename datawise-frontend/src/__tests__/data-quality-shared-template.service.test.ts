import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {formatDataQualitySharedTemplateSummary} from '@/features/platform/services/data-quality-shared-template.service'

describe('data-quality-shared-template.service', () => {
    const t = (key: string) => key

    it('formats empty_result without expected', () => {
        const summary = formatDataQualitySharedTemplateSummary(
            {assertion: 'empty_result', expected: '0', column: null},
            t,
        )
        assert.equal(summary, 'workspace.platformCatalog.form.dqAssertion.empty_result')
    })

    it('formats row count with expected', () => {
        const summary = formatDataQualitySharedTemplateSummary(
            {assertion: 'row_count_lte', expected: '5', column: null},
            t,
        )
        assert.equal(
            summary,
            'workspace.platformCatalog.form.dqAssertion.row_count_lte 5',
        )
    })

    it('formats scalar with column and expected', () => {
        const summary = formatDataQualitySharedTemplateSummary(
            {assertion: 'scalar_lte', expected: '100', column: 'cnt'},
            t,
        )
        assert.equal(
            summary,
            'cnt · workspace.platformCatalog.form.dqAssertion.scalar_lte 100',
        )
    })
})
