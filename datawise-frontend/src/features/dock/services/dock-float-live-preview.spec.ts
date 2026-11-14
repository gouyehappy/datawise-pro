import {describe, expect, it, beforeEach} from 'vitest'
import {effectScope} from 'vue'
import {
    clearDockFloatLivePreview,
    resetDockFloatLivePreviewForTests,
    setDockFloatLivePreview,
    useDockFloatLivePreview,
} from '@/features/dock/services/dock-float-live-preview'

describe('dock-float-live-preview (UX-01)', () => {
    beforeEach(() => {
        resetDockFloatLivePreviewForTests()
    })

    it('stores and clears live geometry per panel', () => {
        const scope = effectScope()
        const live = scope.run(() => useDockFloatLivePreview('terminal'))!
        expect(live.value).toBeNull()
        setDockFloatLivePreview('terminal', {x: 10, y: 20})
        expect(live.value).toEqual({x: 10, y: 20})
        setDockFloatLivePreview('terminal', {width: 400})
        expect(live.value).toEqual({x: 10, y: 20, width: 400})
        clearDockFloatLivePreview('terminal')
        expect(live.value).toBeNull()
        scope.stop()
    })

    it('does not leak across panels', () => {
        const scope = effectScope()
        const terminal = scope.run(() => useDockFloatLivePreview('terminal'))!
        const explorer = scope.run(() => useDockFloatLivePreview('explorer'))!
        setDockFloatLivePreview('terminal', {x: 1})
        expect(terminal.value).toEqual({x: 1})
        expect(explorer.value).toBeNull()
        scope.stop()
    })
})
