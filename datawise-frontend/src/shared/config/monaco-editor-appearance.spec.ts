import {describe, expect, it, vi, beforeEach} from 'vitest'

describe('monaco-editor-appearance (PERF-03)', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.doMock('@/shared/config/monaco-themes', () => ({
            ensureMonacoThemes: vi.fn(),
            applyMonacoTheme: vi.fn(),
        }))
    })

    it('ensureMonacoThemes is async and lazy-loads theme registration', async () => {
        const appearance = await import('@/shared/config/monaco-editor-appearance')
        const themes = await import('@/shared/config/monaco-themes')
        const result = appearance.ensureMonacoThemes()
        expect(result).toBeInstanceOf(Promise)
        await result
        expect(themes.ensureMonacoThemes).toHaveBeenCalledTimes(1)
        await appearance.ensureMonacoThemes()
        expect(themes.ensureMonacoThemes).toHaveBeenCalledTimes(1)
    })

    it('applyEditorTheme ensures themes then applies', async () => {
        const appearance = await import('@/shared/config/monaco-editor-appearance')
        const themes = await import('@/shared/config/monaco-themes')
        appearance.applyEditorTheme('one-dark')
        await vi.waitFor(() => {
            expect(themes.applyMonacoTheme).toHaveBeenCalledWith('one-dark')
        })
        expect(themes.ensureMonacoThemes).toHaveBeenCalled()
    })
})
