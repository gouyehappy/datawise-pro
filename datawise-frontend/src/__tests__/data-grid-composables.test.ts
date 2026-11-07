import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {ref} from 'vue'
import {useDataGridCellDetail} from '@/core/data-grid/composables/useDataGridCellDetail'
import {useDataGridExport} from '@/core/data-grid/composables/useDataGridExport'
import type {GridDisplayRow} from '@/core/data-grid/edit/useGridPendingEdit'
import type {TableColumn} from '@/core/types'

const column: TableColumn = {name: 'name', type: 'VARCHAR'}
const item: GridDisplayRow = {id: 'r1', kind: 'existing', originalRow: {name: 'Alice'}}

describe('useDataGridCellDetail', () => {
    it('opens and closes detail state', () => {
        const wizard = useDataGridCellDetail({
            t: (key: string) => key,
            props: {columnDetails: [], canUpdate: true, enableRowDocumentView: false},
            gridColumns: ref([column]),
            displayRows: ref([item]),
            rowOffset: ref(0),
            inlineEnabled: ref(false),
            readRawDisplayRowCell: () => 'Alice',
            setCellValue: () => undefined,
            formViewRow: ref(null),
            formViewRowNumber: ref(1),
        })
        wizard.openCellDetail(item, column, 0)
        assert.equal(wizard.cellDetailOpen.value, true)
        assert.equal(wizard.cellDetail.value?.columnName, 'name')
        wizard.closeCellDetail()
        assert.equal(wizard.cellDetailOpen.value, false)
        assert.equal(wizard.cellDetail.value, null)
    })

    it('applies detail edits through setCellValue', () => {
        let applied = ''
        const wizard = useDataGridCellDetail({
            t: (key: string) => key,
            props: {columnDetails: [], canUpdate: true, enableRowDocumentView: false},
            gridColumns: ref([column]),
            displayRows: ref([item]),
            rowOffset: ref(0),
            inlineEnabled: ref(false),
            readRawDisplayRowCell: () => 'Alice',
            setCellValue: (_row, columnName, value) => {
                applied = columnName + ':' + value
            },
            formViewRow: ref(null),
            formViewRowNumber: ref(1),
        })
        wizard.openCellDetail(item, column, 0)
        wizard.onCellDetailApply('Bob')
        assert.equal(applied, 'name:Bob')
        assert.equal(wizard.cellDetailOpen.value, false)
    })
})

describe('useDataGridExport', () => {
    it('only opens the dialog when export is enabled and columns exist', () => {
        const enabled = {isEnabled: () => true}
        const wizard = useDataGridExport({
            t: (key: string) => key,
            layout: {} as never,
            pluginStore: enabled as never,
            emit: () => undefined,
            props: {exportBaseName: 'result', truncatedAtCap: false},
            displayColumns: ref([column]),
            gridRows: ref([]),
            gridColumns: ref([]),
            viewState: ref(undefined),
            columnFiltersEnabled: ref(false),
        })
        wizard.openExportDialog()
        assert.equal(wizard.exportDialogOpen.value, true)

        const disabled = useDataGridExport({
            t: (key: string) => key,
            layout: {} as never,
            pluginStore: {isEnabled: () => false} as never,
            emit: () => undefined,
            props: {exportBaseName: 'result', truncatedAtCap: false},
            displayColumns: ref([]),
            gridRows: ref([]),
            gridColumns: ref([]),
            viewState: ref(undefined),
            columnFiltersEnabled: ref(false),
        })
        disabled.openExportDialog()
        assert.equal(disabled.exportDialogOpen.value, false)
    })
})
