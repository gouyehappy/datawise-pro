import {describe, expect, it} from 'vitest'
import {
    clampTabFloatToBounds,
    clientPointToFloatOrigin,
    layoutMinimizedFloatStrip,
    layoutTabFloatsCascade,
    layoutTabFloatsTile,
    placeNewTabFloat,
    resolveTabFloatSnap,
    resolveUndockDropFromPointer,
    TAB_FLOAT_MIN_HEIGHT,
    TAB_FLOAT_MIN_WIDTH,
} from './workspace-tab-float.service'

describe('workspace-tab-float.service', () => {
    const bounds = {width: 1000, height: 700}

    it('clamps float rect inside bounds', () => {
        const clamped = clampTabFloatToBounds(
            {x: -40, y: 900, width: 80, height: 40},
            bounds,
        )
        expect(clamped.x).toBe(0)
        expect(clamped.width).toBeGreaterThanOrEqual(TAB_FLOAT_MIN_WIDTH)
        expect(clamped.height).toBeGreaterThanOrEqual(TAB_FLOAT_MIN_HEIGHT)
        expect(clamped.y + Math.min(clamped.height, 36)).toBeLessThanOrEqual(bounds.height)
    })

    it('staggers new float placement', () => {
        const a = placeNewTabFloat(0, bounds)
        const b = placeNewTabFloat(1, bounds)
        expect(a.x).not.toBe(b.x)
        expect(a.y).not.toBe(b.y)
    })

    it('maps client point to float origin relative to surface', () => {
        const surface = {
            left: 100,
            top: 50,
            width: 800,
            height: 600,
            right: 900,
            bottom: 650,
            x: 100,
            y: 50,
            toJSON: () => ({}),
        } as DOMRect
        const rect = clientPointToFloatOrigin(220, 110, surface)
        expect(rect.x).toBe(96)
        expect(rect.y).toBe(48)
    })

    it('resolves edge and corner snap targets', () => {
        expect(resolveTabFloatSnap({x: 0, y: 80, width: 400, height: 300}, bounds)?.edge).toBe('left')
        expect(resolveTabFloatSnap({x: 700, y: 80, width: 400, height: 300}, bounds)?.edge).toBe('right')
        expect(resolveTabFloatSnap({x: 200, y: 0, width: 400, height: 300}, bounds)?.edge).toBe('top')
        expect(resolveTabFloatSnap({x: 0, y: 0, width: 400, height: 300}, bounds)?.edge).toBe('top-left')
        expect(resolveTabFloatSnap({x: 700, y: 0, width: 400, height: 300}, bounds)?.edge).toBe('top-right')
        expect(resolveTabFloatSnap({x: 0, y: 450, width: 400, height: 300}, bounds)?.edge).toBe('bottom-left')
        expect(resolveTabFloatSnap({x: 700, y: 450, width: 400, height: 300}, bounds)?.edge).toBe('bottom-right')
        expect(resolveTabFloatSnap({x: 300, y: 200, width: 400, height: 300}, bounds)).toBeNull()
    })

    it('resolves undock drop from pointer like IDEA editor frames', () => {
        const surface = {left: 0, top: 0, width: 1000, height: 700}
        expect(resolveUndockDropFromPointer(40, 300, surface).kind).toBe('left')
        expect(resolveUndockDropFromPointer(960, 300, surface).kind).toBe('right')
        expect(resolveUndockDropFromPointer(500, 20, surface).kind).toBe('top')
        expect(resolveUndockDropFromPointer(500, 320, surface).kind).toBe('free')
        const left = resolveUndockDropFromPointer(20, 280, surface)
        expect(left.rect.x).toBeLessThan(40)
        expect(left.rect.width).toBeGreaterThan(400)
    })

    it('tiles and cascades floats without overlap of origins', () => {
        const tiled = layoutTabFloatsTile(4, bounds)
        expect(tiled).toHaveLength(4)
        expect(new Set(tiled.map((r) => `${r.x},${r.y}`)).size).toBe(4)
        const cascaded = layoutTabFloatsCascade(3, bounds)
        expect(cascaded[0]!.x).toBeLessThan(cascaded[1]!.x)
        const strip = layoutMinimizedFloatStrip(2, bounds)
        expect(strip[0]!.y).toBe(strip[1]!.y)
        expect(strip[0]!.x).toBeLessThan(strip[1]!.x)
    })
})
