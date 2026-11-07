import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildGridCalendarCells,
    formatGridDateTimeParts,
    parseGridDateTimeText,
    shiftGridCalendarMonth,
} from '@/features/workspace/services/grid-datetime.service'
import {resolveGridTemporalKind} from '@/core/components/data-grid-column-meta'

describe('grid-datetime.service', () => {
    it('detects temporal column kinds', () => {
        assert.equal(resolveGridTemporalKind({name: 'created', type: 'datetime'}, []), 'datetime')
        assert.equal(resolveGridTemporalKind({name: 'ts', type: 'timestamp'}, []), 'datetime')
        assert.equal(resolveGridTemporalKind({name: 'd', type: 'date'}, []), 'date')
        assert.equal(resolveGridTemporalKind({name: 't', type: 'time'}, []), 'time')
        assert.equal(resolveGridTemporalKind({name: 'id', type: 'int'}, []), null)
    })

    it('parses and formats datetime text', () => {
        const parts = parseGridDateTimeText('2026-07-14 11:15:28.234', 'datetime')
        assert.equal(parts.year, 2026)
        assert.equal(parts.month, 7)
        assert.equal(parts.day, 14)
        assert.equal(parts.hour, 11)
        assert.equal(parts.minute, 15)
        assert.equal(parts.second, 28)
        assert.equal(parts.millis, 234)
        assert.equal(
            formatGridDateTimeParts(parts, 'datetime', {withMillis: true}),
            '2026-07-14 11:15:28.234',
        )
        assert.equal(formatGridDateTimeParts(parts, 'date'), '2026-07-14')
        assert.equal(formatGridDateTimeParts(parts, 'time'), '11:15:28')
    })

    it('builds calendar month and shifts', () => {
        const cells = buildGridCalendarCells(2026, 7)
        assert.equal(cells.length, 42)
        assert.ok(cells.some((cell) => cell.inCurrentMonth && cell.day === 14))
        assert.deepEqual(shiftGridCalendarMonth(2026, 12, 1), {year: 2027, month: 1})
        assert.deepEqual(shiftGridCalendarMonth(2026, 1, -1), {year: 2025, month: 12})
    })
})
