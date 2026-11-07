import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    clampCanvasNodePosition,
    layoutVisualQueryCanvas,
} from '@/features/workspace/services/visual-query-canvas.service'

describe('visual-query-canvas.service', () => {
    it('layouts from table and joins left to right', () => {
        const layout = layoutVisualQueryCanvas({
            fromTable: 'orders',
            fromAlias: 'o',
            joins: [
                {table: 'users', alias: 'u', type: 'LEFT'},
                {table: 'items', alias: 'i', type: 'INNER'},
            ],
        })
        assert.equal(layout.nodes.length, 3)
        assert.equal(layout.edges.length, 2)
        assert.equal(layout.nodes[0].kind, 'from')
        assert.ok(layout.nodes[1].x > layout.nodes[0].x)
        assert.ok(layout.nodes[2].x > layout.nodes[1].x)
        assert.equal(layout.edges[0].label, 'LEFT')
        assert.equal(layout.edges[1].label, 'INNER')
    })

    it('applies position overrides and grows canvas bounds', () => {
        const layout = layoutVisualQueryCanvas({
            fromTable: 'orders',
            fromAlias: 'o',
            joins: [{table: 'users', alias: 'u', type: 'LEFT'}],
            positionOverrides: {
                from: {x: 40, y: 120},
                'join-0': {x: 320, y: 200},
            },
        })
        assert.equal(layout.nodes[0].x, 40)
        assert.equal(layout.nodes[0].y, 120)
        assert.equal(layout.nodes[1].x, 320)
        assert.equal(layout.nodes[1].y, 200)
        assert.ok(layout.height >= 200 + 72 + 24)
        assert.ok(layout.width >= 320 + 168 + 24)
    })

    it('clamps dragged node positions inside padded canvas', () => {
        assert.deepEqual(clampCanvasNodePosition(-10, -5, 168, 72, 480, 240), {x: 24, y: 24})
        assert.deepEqual(clampCanvasNodePosition(900, 900, 168, 72, 480, 240), {x: 288, y: 144})
    })

    it('returns empty layout without from table', () => {
        const layout = layoutVisualQueryCanvas({
            fromTable: '',
            fromAlias: '',
            joins: [{table: 'users', alias: 'u', type: 'LEFT'}],
        })
        assert.equal(layout.nodes.length, 0)
        assert.equal(layout.edges.length, 0)
    })
})
