import {describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import type {ConsoleQueryState, QueryResultItem} from '@/features/workspace/types'
import {createWorkspaceConsoleDomain} from '@/features/workspace/stores/workspace-console.domain'

function result(partial: Partial<QueryResultItem> & Pick<QueryResultItem, 'id'>): QueryResultItem {
    return {
        label: 'R1',
        sql: 'select 1',
        columns: [],
        rows: [],
        total: 0,
        durationMs: 0,
        status: 'success',
        ...partial,
    }
}

describe('createWorkspaceConsoleDomain', () => {
    it('tracks run generations and clears tab-local console state', () => {
        const consoleQueryByTabId = ref<Record<string, ConsoleQueryState>>({})
        const consoleRunningByTabId = ref<Record<string, boolean>>({})
        const consoleRunGenerationByTabId = ref<Record<string, number>>({})
        const setExecutionResult = vi.fn()
        const onClearTabExtras = vi.fn()
        const closeCursor = vi.fn(async () => undefined)

        const domain = createWorkspaceConsoleDomain({
            consoleQueryByTabId,
            consoleRunningByTabId,
            consoleRunGenerationByTabId,
            setExecutionResult,
            onClearTabExtras,
            closeCursor,
            cancelExecution: vi.fn(async () => undefined),
        })

        const gen = domain.beginConsoleRun('tab-1')
        expect(gen).toBe(1)
        expect(domain.isConsoleRunning('tab-1')).toBe(true)
        expect(domain.isConsoleRunCurrent('tab-1', gen)).toBe(true)

        domain.setConsoleQueryResults('tab-1', [result({id: 'r1', cursorId: 'c1'})])
        expect(domain.getConsoleQueryState('tab-1').results).toHaveLength(1)

        domain.clearTabConsoleLocalState('tab-1')
        expect(consoleQueryByTabId.value['tab-1']).toBeUndefined()
        expect(domain.isConsoleRunning('tab-1')).toBe(false)
        expect(onClearTabExtras).toHaveBeenCalledWith('tab-1')
        expect(closeCursor).toHaveBeenCalledWith('c1')
    })

    it('resetConsoleQueryBag empties query bag', () => {
        const consoleQueryByTabId = ref<Record<string, ConsoleQueryState>>({
            'tab-1': {results: [], activeView: 0},
        })
        const domain = createWorkspaceConsoleDomain({
            consoleQueryByTabId,
            consoleRunningByTabId: ref({}),
            consoleRunGenerationByTabId: ref({}),
            setExecutionResult: vi.fn(),
        })
        domain.resetConsoleQueryBag()
        expect(consoleQueryByTabId.value).toEqual({})
    })
})
