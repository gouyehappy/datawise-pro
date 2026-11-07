import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {ref} from 'vue'
import {useDataGridEditable} from '@/core/data-grid/composables/useDataGridEditable'
import type {GridDisplayRow} from '@/core/data-grid/edit/useGridPendingEdit'
import type {TableColumn} from '@/core/types'

const column: TableColumn = {name: 'name', type: 'VARCHAR'}
const row: GridDisplayRow = {id: 'r1', kind: 'existing', originalRow: {name: 'Alice'}}

function deps(overrides: Partial<Parameters<typeof useDataGridEditable>[0]> = {}) {
    const editingCell = ref<{rowId: string; column: string} | null>(null)
    const cellInputRef = ref<HTMLInputElement | null>(null)
    const base: Parameters<typeof useDataGridEditable>[0] = {
        t: (key: string) => key,
        props: {editable: true, canDelete: true, canUpdate: true, columnDetails: []},
        gridColumns: ref([column]),
        displayRows: ref([row]),
        pagedRows: ref([row]),
        currentPage: ref(1),
        totalPages: ref(1),
        gridBodyRef: ref(null),
        useGridVirtual: ref(false),
        readRawDisplayRowCell: () => 'Alice',
        getCellDisplayText: () => 'Alice',
        isCellEditing: () => false,
        addInsertRow: () => undefined,
        markDeleteSelected: () => undefined,
        submitPending: () => Promise.resolve(true),
        discardPending: () => undefined,
        setCellValue: () => undefined,
        selectedRowId: ref(null),
        hasPendingChanges: ref(false),
        pendingCount: ref(0),
        submitting: ref(false),
        editingCell,
        cellInputRef,
        scrollToRowIndex: () => undefined,
        closeDateTimePicker: () => undefined,
        stopEditCell: () => undefined,
        ...overrides,
    }
    return base
}

describe('useDataGridEditable', () => {
    it('computes delete/submit enablement from pending edit state', () => {
        const wizard = useDataGridEditable(deps({selectedRowId: ref('r1'), hasPendingChanges: ref(true)}))
        assert.equal(wizard.deleteEnabled.value, true)
        assert.equal(wizard.submitEnabled.value, false) // inlineEnabled requires columnDetails
        assert.equal(wizard.discardEnabled.value, true)
    })

    it('cellBackingText falls back to null value and nbsp', () => {
        const wizard = useDataGridEditable(deps())
        assert.equal(wizard.cellBackingText(row, 'name'), 'Alice')
        const emptyRow: GridDisplayRow = {id: 'new', kind: 'insert'}
        const wizardEmpty = useDataGridEditable(deps({getCellDisplayText: () => ''}))
        assert.equal(wizardEmpty.cellBackingText(emptyRow, 'name'), '\u00a0')
    })

    it('onCellInput routes to setCellValue', () => {
        let applied = ''
        const wizard = useDataGridEditable(deps({
            setCellValue: (_row, columnName, value) => {
                applied = columnName + ':' + value
            },
        }))
        wizard.onCellInput(row, 'name', 'Bob')
        assert.equal(applied, 'name:Bob')
    })

    it('onCellKeydownEnter prevents default and stops editing', () => {
        let stopped = false
        const wizard = useDataGridEditable(deps({
            stopEditCell: () => {
                stopped = true
            },
        }))
        const event = {preventDefault: () => undefined} as KeyboardEvent
        wizard.onCellKeydownEnter(event)
        assert.equal(stopped, true)
    })
})
