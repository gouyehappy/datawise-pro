import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildAnalysisMarkdownExport,
    buildAnalysisHtmlExport,
} from '@/features/ai/analysis/services/analysis-export.service'
import {
    buildTemplateName,
    createAnalysisTemplate,
    upsertAnalysisTemplate,
} from '@/features/ai/analysis/services/analysis-template.service'

describe('analysis export service', () => {
    it('builds markdown with sql python and report sections', () => {
        const markdown = buildAnalysisMarkdownExport({
            sql: 'SELECT 1',
            columns: [{name: 'n', key: 'n'}],
            rows: [{n: 1}],
            pythonInsight: 'Insight text',
            report: {markdown: '## Summary\n\nDone.'},
        }, {title: 'Test Report', generatedAt: new Date('2026-06-17T00:00:00.000Z')})

        assert.match(markdown, /^# Test Report/)
        assert.match(markdown, /```sql\nSELECT 1\n```/)
        assert.match(markdown, /## Python Insight/)
        assert.match(markdown, /## Report/)
    })

    it('builds html document with escaped sql', () => {
        const html = buildAnalysisHtmlExport({
            sql: 'SELECT "<tag>"',
            columns: [],
            rows: [],
        })
        assert.match(html, /<title>Analysis Report<\/title>/)
        assert.match(html, /SELECT &quot;&lt;tag&gt;&quot;/)
    })
})

describe('analysis template service', () => {
    it('creates template with trimmed prompt and default smart mode', () => {
        const template = createAnalysisTemplate({
            prompt: '  analyze sales  ',
            targetIds: ['t-1'],
        })
        assert.equal(template.prompt, 'analyze sales')
        assert.equal(template.analysisMode, 'smart')
        assert.deepEqual(template.targetIds, ['t-1'])
    })

    it('builds truncated template name', () => {
        const name = buildTemplateName('a'.repeat(40), 10)
        assert.equal(name.length, 11)
        assert.match(name, /…$/)
    })

    it('upserts template by id at front', () => {
        const first = createAnalysisTemplate({prompt: 'first'})
        const second = createAnalysisTemplate({prompt: 'second'})
        const merged = upsertAnalysisTemplate([first], second)
        assert.equal(merged[0].id, second.id)
        assert.equal(merged[1].id, first.id)
    })
})
