import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {computed, nextTick, ref} from 'vue'
import {
    GRID_ROW_HEIGHT,
    GRID_ROW_OVERSCAN,
    GRID_VIRTUAL_THRESHOLD,
    isRowWindowComfortable,
    resolveRowVirtualWindow,
    useGridVirtualWindow,
} from '@/core/composables/useGridVirtualWindow'

describe('grid-virtual-window', () => {
    it('keeps row virtualization above normal grid page sizes', () => {
        // Page sizes top out at 1000; spacer virt inside a page hurts vertical fling feel.
        assert.ok(GRID_VIRTUAL_THRESHOLD > 1000)
        assert.equal(GRID_ROW_HEIGHT, 30)
        assert.ok(GRID_ROW_OVERSCAN >= 8)
    })

    it('returns all rows when below threshold', () => {
        const scrollContainer = ref<HTMLElement | null>(null)
        const rows = ref([{id: '1'}, {id: '2'}])
        const {useVirtual, visibleRows} = useGridVirtualWindow(scrollContainer, rows)
        assert.equal(useVirtual.value, false)
        assert.equal(visibleRows.value.length, 2)
        assert.equal(visibleRows.value[0]?.index, 0)
    })

    it('does not spacer-virtualize a typical 200-row page', () => {
        const scrollEl = {
            scrollTop: 0,
            clientHeight: 300,
            addEventListener: () => {},
            removeEventListener: () => {},
        } as unknown as HTMLElement
        const scrollContainer = ref<HTMLElement | null>(scrollEl)
        const rows = ref(Array.from({length: 200}, (_, index) => ({id: String(index)})))
        const {useVirtual, visibleRows, syncViewport} = useGridVirtualWindow(scrollContainer, rows)
        syncViewport()
        assert.equal(useVirtual.value, false)
        assert.equal(visibleRows.value.length, 200)
    })

    it('resets to the top of the new page when rows are replaced mid-scroll', async () => {
        const scrollEl = {
            scrollTop: 0,
            clientHeight: 300,
            addEventListener: () => {},
            removeEventListener: () => {},
        } as unknown as HTMLElement
        const scrollContainer = ref<HTMLElement | null>(scrollEl)
        const rows = ref(Array.from({length: 200}, (_, index) => ({id: `a-${index}`})))
        const {visibleRows, syncViewport} = useGridVirtualWindow(scrollContainer, rows, {threshold: 50})
        await nextTick()
        scrollEl.scrollTop = 1200
        syncViewport()
        assert.ok((visibleRows.value[0]?.index ?? 0) > 0)

        // Simulate a page flip while still scrolled down.
        rows.value = Array.from({length: 200}, (_, index) => ({id: `b-${index}`}))
        await nextTick()
        assert.equal(scrollEl.scrollTop, 0)
        assert.equal(visibleRows.value[0]?.item.id, 'b-0')
        assert.equal(visibleRows.value[0]?.index, 0)
    })

    it('slices visible window when explicitly enabled above threshold', () => {
        const scrollEl = {
            scrollTop: 0,
            clientHeight: 300,
            addEventListener: () => {},
            removeEventListener: () => {},
        } as unknown as HTMLElement
        const scrollContainer = ref<HTMLElement | null>(scrollEl)

        const rows = ref(Array.from({length: 120}, (_, index) => ({id: String(index)})))
        const enabled = computed(() => true)
        const {useVirtual, visibleRows, paddingTop, paddingBottom, syncViewport} = useGridVirtualWindow(
            scrollContainer,
            rows,
            {enabled, threshold: 50},
        )
        syncViewport()

        assert.equal(useVirtual.value, true)
        assert.ok(visibleRows.value.length < rows.value.length)
        assert.equal(paddingTop.value, 0)
        assert.ok(paddingBottom.value > 0)
        assert.equal(visibleRows.value[0]?.index, 0)
    })

    it('keeps committed row window inside hysteresis band', () => {
        const committed = resolveRowVirtualWindow({
            total: 200,
            scrollTop: 900,
            viewportHeight: 300,
            overscan: 12,
            threshold: 50,
        })
        assert.equal(
            isRowWindowComfortable({
                committed,
                scrollTop: 920,
                viewportHeight: 300,
                hysteresis: 4,
            }),
            true,
        )
        assert.equal(
            isRowWindowComfortable({
                committed,
                scrollTop: committed.paddingTop + 10,
                viewportHeight: 300,
                hysteresis: 4,
            }),
            false,
        )
    })
})
