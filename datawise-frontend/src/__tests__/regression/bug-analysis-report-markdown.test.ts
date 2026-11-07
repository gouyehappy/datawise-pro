import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {parseAnalysisReport} from '@/features/ai/analysis/services/analysis-report-markdown.service'

describe('analysis-report-markdown.service', () => {
    it('splits markdown into titled sections with safe html', () => {
        const markdown = `# Analysis Report

## Summary

Sales grew **12%** month over month.

## SQL

\`\`\`sql
SELECT * FROM sales
\`\`\`
`
        const parsed = parseAnalysisReport(markdown)

        assert.equal(parsed.title, 'Analysis Report')
        assert.equal(parsed.sections.length, 2)
        assert.equal(parsed.sections[0].title, 'Summary')
        assert.ok(parsed.sections[0].html.includes('<strong>12%</strong>'))
        assert.ok(parsed.sections[1].html.includes('SELECT * FROM sales'))
        assert.equal(parsed.sections[1].blocks[0]?.type, 'code')
        assert.equal(parsed.sections[1].blocks[0]?.type === 'code' ? parsed.sections[1].blocks[0].lang : '', 'sql')
        assert.equal(
            parsed.sections[1].blocks[0]?.type === 'code' ? parsed.sections[1].blocks[0].code : '',
            'SELECT * FROM sales',
        )
        assert.ok(parsed.excerpt.includes('Sales grew'))
    })

    it('renders markdown tables', () => {
        const markdown = `## Data Preview

| id | name |
| --- | --- |
| 1 | east |
`
        const parsed = parseAnalysisReport(markdown)

        assert.ok(parsed.sections[0].html.includes('<table'))
        assert.ok(parsed.sections[0].html.includes('<td>east</td>'))
    })
})
