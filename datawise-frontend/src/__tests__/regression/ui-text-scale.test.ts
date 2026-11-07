import assert from 'node:assert/strict'
import test from 'node:test'
import {
    DEFAULT_UI_TEXT_SCALE,
    UI_FONT_SIZE_PX_BY_SCALE,
    UI_TEXT_SCALE_EXCLUDED_SURFACES,
    UI_TEXT_SCALE_FACTOR,
    UI_TEXT_SCALE_IDS,
    resolveBodyFontSizePx,
    resolveUiTextScaleFactor,
    resolveUiTextScaleFactorFromPrefs,
    resolveUiTextScaleId,
} from '@/shared/config/ui-text-scale'

test('ui text scale ids and factors stay aligned', () => {
    assert.deepEqual([...UI_TEXT_SCALE_IDS], ['sm', 'md', 'lg', 'custom'])
    assert.equal(DEFAULT_UI_TEXT_SCALE, 'md')
    assert.equal(UI_TEXT_SCALE_FACTOR.md, 1)
    assert.ok(UI_TEXT_SCALE_FACTOR.sm < 1)
    assert.ok(UI_TEXT_SCALE_FACTOR.lg > 1)
})

test('resolveUiTextScaleId falls back to md', () => {
    assert.equal(resolveUiTextScaleId('lg'), 'lg')
    assert.equal(resolveUiTextScaleId('custom'), 'custom')
    assert.equal(resolveUiTextScaleId('nope'), 'md')
    assert.equal(resolveUiTextScaleId(null), 'md')
})

test('resolveUiTextScaleFactor maps known and unknown values', () => {
    assert.equal(resolveUiTextScaleFactor('sm'), UI_TEXT_SCALE_FACTOR.sm)
    assert.equal(resolveUiTextScaleFactor('unknown'), UI_TEXT_SCALE_FACTOR.md)
    assert.equal(resolveUiTextScaleFactor('custom'), 1)
})

test('custom body px drives factor and body size', () => {
    assert.equal(resolveBodyFontSizePx({uiTextScale: 'md'}), UI_FONT_SIZE_PX_BY_SCALE.md)
    assert.equal(resolveBodyFontSizePx({uiTextScale: 'sm'}), UI_FONT_SIZE_PX_BY_SCALE.sm)
    assert.equal(resolveBodyFontSizePx({uiTextScale: 'custom', uiFontSizePx: 16}), 16)
    assert.equal(resolveBodyFontSizePx({uiTextScale: 'custom', uiFontSizePx: 10}), 11)
    assert.equal(
        resolveUiTextScaleFactorFromPrefs({uiTextScale: 'custom', uiFontSizePx: 13.5}),
        1,
    )
    assert.ok(resolveUiTextScaleFactorFromPrefs({uiTextScale: 'custom', uiFontSizePx: 15}) > 1)
})

test('excluded surfaces stay documented (no extra settings — existing knobs only)', () => {
    assert.ok(UI_TEXT_SCALE_EXCLUDED_SURFACES.includes('monaco-editor'))
    assert.ok(UI_TEXT_SCALE_EXCLUDED_SURFACES.includes('desktop-zoom'))
    assert.ok(UI_TEXT_SCALE_EXCLUDED_SURFACES.includes('lock-screen-branding'))
})
