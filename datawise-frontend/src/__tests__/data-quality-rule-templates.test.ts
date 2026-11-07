import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    applyDataQualityRuleTemplate,
    DATA_QUALITY_RULE_TEMPLATES,
    findDataQualityRuleTemplate,
} from '@/features/platform/constants/data-quality-rule-templates'

describe('data-quality-rule-templates', () => {
    it('exposes five built-in templates with unique ids', () => {
        assert.equal(DATA_QUALITY_RULE_TEMPLATES.length, 5)
        const ids = new Set(DATA_QUALITY_RULE_TEMPLATES.map((item) => item.id))
        assert.equal(ids.size, 5)
    })

    it('findDataQualityRuleTemplate returns null for blank/unknown', () => {
        assert.equal(findDataQualityRuleTemplate(''), null)
        assert.equal(findDataQualityRuleTemplate('__custom__'), null)
        assert.equal(findDataQualityRuleTemplate('missing'), null)
        assert.equal(findDataQualityRuleTemplate('no_nulls')?.id, 'no_nulls')
    })

    it('applyDataQualityRuleTemplate prefills form fields', () => {
        const tpl = findDataQualityRuleTemplate('failed_count_threshold')
        assert.ok(tpl)
        const fields = applyDataQualityRuleTemplate(tpl, (key) => `L:${key}`)
        assert.equal(fields.name, 'L:failed_count_threshold')
        assert.equal(fields.dqAssertion, 'scalar_lte')
        assert.equal(fields.dqExpected, '100')
        assert.equal(fields.dqColumn, 'cnt')
        assert.equal(fields.dqBlocking, false)
        assert.ok(fields.sql.includes('{table}'))
        assert.equal(fields.cronExpression, undefined)
    })

    it('blocking templates default to release-gate suite', () => {
        const blocking = DATA_QUALITY_RULE_TEMPLATES.filter((item) => item.blocking)
        assert.ok(blocking.length >= 3)
        const noDup = applyDataQualityRuleTemplate(
            findDataQualityRuleTemplate('no_duplicates')!,
            (key) => key,
        )
        assert.equal(noDup.dqAssertion, 'empty_result')
        assert.equal(noDup.dqBlocking, true)
    })
})
