import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
    ASSISTANT_FLOAT_GEOMETRY_KEY,
    clampAssistantFloatGeometry,
    readAssistantFloatGeometry,
    writeAssistantFloatGeometry,
} from './assistant-float-geometry.service'

vi.mock('@/shared/config/app-config-storage-scope', () => ({
    resolveUserStorageKey: (key: string) => key,
}))

describe('assistant-float-geometry.service', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.stubGlobal('innerWidth', 1280)
        vi.stubGlobal('innerHeight', 800)
    })

    afterEach(() => {
        localStorage.clear()
        vi.unstubAllGlobals()
    })

    it('round-trips geometry through localStorage', () => {
        writeAssistantFloatGeometry({x: 40, y: 60, w: 420, h: 520})
        expect(localStorage.getItem(ASSISTANT_FLOAT_GEOMETRY_KEY)).toBeTruthy()
        expect(readAssistantFloatGeometry()).toEqual({x: 40, y: 60, w: 420, h: 520})
    })

    it('returns null for corrupt payloads', () => {
        localStorage.setItem(ASSISTANT_FLOAT_GEOMETRY_KEY, '{"x":1}')
        expect(readAssistantFloatGeometry()).toBeNull()
    })

    it('clamps into the viewport', () => {
        const clamped = clampAssistantFloatGeometry(
            {x: 9000, y: -20, w: 120, h: 9000},
            {minW: 280, maxW: 640, minH: 320, maxH: 700},
        )
        expect(clamped.w).toBe(280)
        expect(clamped.h).toBe(700)
        expect(clamped.x).toBe(Math.max(0, 1280 - 280))
        expect(clamped.y).toBe(0)
    })
})
