import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    applyExportMasking,
    createDefaultExportMaskConfig,
    guessMaskTemplate,
    maskEmail,
    maskIdCard,
    maskPhone,
} from '@/features/workspace/services/data-masking.service'

describe('data-masking.service', () => {
    it('guesses templates from column names', () => {
        assert.equal(guessMaskTemplate('mobile_phone'), 'phone')
        assert.equal(guessMaskTemplate('user_email'), 'email')
        assert.equal(guessMaskTemplate('id_card_no'), 'idCard')
        assert.equal(guessMaskTemplate('amount'), null)
    })

    it('masks phone email and id card values', () => {
        assert.equal(maskPhone('13812345678'), '138****5678')
        assert.equal(maskEmail('alice@example.com'), 'a***e@example.com')
        assert.equal(maskIdCard('110101199001011234'), '110101********1234')
    })

    it('applies masking only to enabled columns', () => {
        const columns = [
            {name: 'mobile', key: 'mobile'},
            {name: 'name', key: 'name'},
        ]
        const rows = [{mobile: '13812345678', name: 'Alice'}]
        const config = createDefaultExportMaskConfig(columns, true)
        const masked = applyExportMasking(columns, rows, config)
        assert.equal(masked[0]?.mobile, '138****5678')
        assert.equal(masked[0]?.name, 'Alice')
    })

    it('defaults prod suggestion to sensitive columns only', () => {
        const config = createDefaultExportMaskConfig(
            [{name: 'email', key: 'email'}, {name: 'qty', key: 'qty'}],
            true,
        )
        assert.equal(config.enabled, true)
        assert.equal(config.columns.find((item) => item.columnName === 'email')?.enabled, true)
        assert.equal(config.columns.find((item) => item.columnName === 'qty')?.enabled, false)
    })
})
