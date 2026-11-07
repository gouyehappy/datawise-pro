import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import zhNav from '@/i18n/locales/zh-CN/nav'
import enNav from '@/i18n/locales/en-US/nav'
import zhShortcut from '@/i18n/locales/zh-CN/shortcut'
import enShortcut from '@/i18n/locales/en-US/shortcut'
import {SIDE_RAIL_NAV_DEFS} from '@/features/layout/constants/side-rail-nav'
import {SHORTCUT_RAIL_NAV_DEFS} from '@/features/layout/constants/shortcut-rail'

describe('ambient rail / journey i18n hygiene', () => {
    it('side-rail caption keys resolve in zh/en', () => {
        for (const item of SIDE_RAIL_NAV_DEFS) {
            const segments = item.captionKey.split('.')
            assert.equal(segments[0], 'nav')
            assert.equal(segments[1], 'caption')
            const key = segments[2]
            assert.ok(
                (zhNav.caption as Record<string, string>)[key],
                `zh missing ${item.captionKey}`,
            )
            assert.ok(
                (enNav.caption as Record<string, string>)[key],
                `en missing ${item.captionKey}`,
            )
        }
        assert.ok(zhNav.caption.home)
        assert.ok(enNav.caption.home)
        assert.equal(enNav.caption.connectorMarket, 'Connect')
        assert.equal(enNav.caption.packStore, 'Store')
        assert.ok(zhNav.packStore)
        assert.ok(enNav.packStore)
    })

    it('shortcut-rail caption keys resolve in zh/en', () => {
        for (const item of SHORTCUT_RAIL_NAV_DEFS) {
            const segments = item.captionKey.split('.')
            assert.equal(segments[0], 'shortcut')
            assert.equal(segments[1], 'short')
            const key = segments[2]
            assert.ok(
                (zhShortcut.short as Record<string, string>)[key],
                `zh missing ${item.captionKey}`,
            )
            assert.ok(
                (enShortcut.short as Record<string, string>)[key],
                `en missing ${item.captionKey}`,
            )
        }
    })

    it('journey pack teaser keys exist', () => {
        assert.ok(zhNav.journey.packTeaser.includes('{count}'))
        assert.ok(enNav.journey.packTeaser.includes('{count}'))
        assert.ok(zhNav.journey.browsePacks)
        assert.ok(enNav.journey.browsePacks)
    })
})
