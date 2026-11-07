import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    isTerminalTarget,
    matchesBinding,
    stripTrailingShortcutHint,
} from '@/core/shortcuts/shortcut.service'

describe('app shortcut listener — editable target bindings', () => {
    it('matches Ctrl+R and Ctrl+S for console actions', () => {
        assert.equal(
            matchesBinding({key: 'r', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false} as KeyboardEvent, 'Ctrl+R'),
            true,
        )
        assert.equal(
            matchesBinding({key: 's', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false} as KeyboardEvent, 'Ctrl+S'),
            true,
        )
    })

    it('matches Alt+/ for ai prompt without stealing Ctrl+/ comment', () => {
        assert.equal(
            matchesBinding({key: '/', ctrlKey: false, metaKey: false, altKey: true, shiftKey: false} as KeyboardEvent, 'Alt+/'),
            true,
        )
        assert.equal(
            matchesBinding({key: '/', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false} as KeyboardEvent, 'Alt+/'),
            false,
        )
        assert.equal(
            matchesBinding({key: '/', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false} as KeyboardEvent, 'Alt+/'),
            false,
        )
    })

    it('detects xterm as terminal target so / is not stolen for AI prompt', () => {
        const host = {closest: (sel: string) => (sel === '.xterm' ? {} : null)} as unknown as HTMLElement
        assert.equal(isTerminalTarget(host), true)
        assert.equal(isTerminalTarget(null), false)
    })
})

describe('stripTrailingShortcutHint', () => {
    it('removes legacy Ctrl shortcut suffixes from i18n labels', () => {
        assert.equal(stripTrailingShortcutHint('保存 (Ctrl+S)'), '保存')
        assert.equal(stripTrailingShortcutHint('Run selection (Ctrl+R)'), 'Run selection')
        assert.equal(stripTrailingShortcutHint('New console (Ctrl+Shift+L)'), 'New console')
    })

    it('removes slash shortcut suffix', () => {
        assert.equal(stripTrailingShortcutHint('AI 生成 SQL (/)'), 'AI 生成 SQL')
    })

    it('preserves non-shortcut trailing parentheses', () => {
        assert.equal(
            stripTrailingShortcutHint('Locate active tab (table / script file)'),
            'Locate active tab (table / script file)',
        )
    })
})
