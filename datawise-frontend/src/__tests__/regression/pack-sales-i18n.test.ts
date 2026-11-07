import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import zh from '@/i18n/locales/zh-CN/pack'
import en from '@/i18n/locales/en-US/pack'
import {PACK_CATALOG, SUITE_CATALOG} from '@/features/pack/catalog/pack-catalog'
import {packCapabilityKey, packLocaleSegment, packNameKey} from '@/features/pack/services/pack-i18n'
import {createI18n} from 'vue-i18n'
import zhRoot from '@/i18n/locales/zh-CN'
import enRoot from '@/i18n/locales/en-US'

describe('pack sales i18n (Wave 18)', () => {
    it('covers every catalog pack and suite in zh/en', () => {
        for (const pack of PACK_CATALOG) {
            const key = packLocaleSegment(pack.id)
            assert.ok(
                (zh.packs as Record<string, unknown>)[key],
                `zh missing ${pack.id} → ${key}`,
            )
            assert.ok(
                (en.packs as Record<string, unknown>)[key],
                `en missing ${pack.id} → ${key}`,
            )
        }
        for (const suite of SUITE_CATALOG) {
            const key = packLocaleSegment(suite.id)
            assert.ok(
                (zh.suite as Record<string, unknown>)[key],
                `zh suite missing ${suite.id} → ${key}`,
            )
            assert.ok(
                (en.suite as Record<string, unknown>)[key],
                `en suite missing ${suite.id} → ${key}`,
            )
        }
    })

    it('covers every catalog capability label in zh/en', () => {
        const caps = new Set(PACK_CATALOG.flatMap((pack) => [...pack.capabilities]))
        for (const cap of caps) {
            const key = packLocaleSegment(cap)
            assert.ok(
                (zh.capabilities as Record<string, unknown>)[key],
                `zh capability missing ${cap} → ${key}`,
            )
            assert.ok(
                (en.capabilities as Record<string, unknown>)[key],
                `en capability missing ${cap} → ${key}`,
            )
        }
    })

    it('resolves dotted capability ids through vue-i18n (no raw key leak)', () => {
        const i18n = createI18n({
            legacy: false,
            locale: 'zh-CN',
            messages: {'zh-CN': zhRoot, 'en-US': enRoot},
        })
        const label = i18n.global.t(packCapabilityKey('ai.workbench'))
        assert.notEqual(label, packCapabilityKey('ai.workbench'))
        assert.equal(label, 'AI Agent')
    })

    it('exposes sales one-pager keys', () => {
        for (const key of ['headline', 'pricing', 'tipPro', 'tipDomestic', 'tipLegacy'] as const) {
            assert.ok(zh.sales[key]?.length > 0, `zh.sales.${key}`)
            assert.ok(en.sales[key]?.length > 0, `en.sales.${key}`)
        }
    })

    it('resolves dotted pack ids through vue-i18n (no raw key leak)', () => {
        const i18n = createI18n({
            legacy: false,
            locale: 'zh-CN',
            messages: {'zh-CN': zhRoot, 'en-US': enRoot},
        })
        const name = i18n.global.t(packNameKey('pack.ai'))
        assert.notEqual(name, packNameKey('pack.ai'))
        assert.ok(String(name).includes('AI'))
        const suite = i18n.global.t(`pack.suite.${packLocaleSegment('suite.pro')}.name`)
        assert.equal(suite, 'Pro')
    })
})
