import {describe, expect, it} from 'vitest'
import {
    ANALYSIS_REPORT_MAX_MARKDOWN_CHARS,
    parseAnalysisReport,
    parseAnalysisReportMeta,
} from '@/features/ai/analysis/services/analysis-report-markdown.service'

describe('analysis-report-markdown.service', () => {
    it('parses title and sections from normal markdown', () => {
        const parsed = parseAnalysisReport(`# DataWise Analysis Report

## Summary

Orders are up.

## SQL

\`\`\`sql
select 1
\`\`\`
`)
        expect(parsed.title).toBe('DataWise Analysis Report')
        expect(parsed.sections.length).toBeGreaterThanOrEqual(2)
        expect(parsed.excerpt).toMatch(/Orders/i)
        expect(parsed.truncated).toBeFalsy()
    })

    it('meta parse stays cheap and does not require full HTML', () => {
        const meta = parseAnalysisReportMeta(`# Report

## Summary

Hello world insights.
`)
        expect(meta.title).toBe('Report')
        expect(meta.sectionCount).toBe(1)
        expect(meta.excerpt).toMatch(/Hello/)
    })

    it('clamps oversized markdown instead of throwing RangeError', () => {
        const huge = `# Huge\n\n## Summary\n\n${'x'.repeat(ANALYSIS_REPORT_MAX_MARKDOWN_CHARS + 50_000)}`
        const meta = parseAnalysisReportMeta(huge)
        expect(meta.truncated).toBe(true)
        expect(meta.title).toBe('Huge')

        const parsed = parseAnalysisReport(huge)
        expect(parsed.truncated).toBe(true)
        expect(parsed.sections.length).toBeGreaterThan(0)
        expect(() => JSON.stringify(parsed.sections.map((s) => s.html.length))).not.toThrow()
    })
})
