import {beforeEach, describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import {createI18n} from 'vue-i18n'
import {createPinia, setActivePinia} from 'pinia'
import DataGrid from '@/core/data-grid/components/DataGrid.vue'
import type {TableColumn, TableRow} from '@/core/types'

const messages = {
    en: {
        dataGrid: {
            refresh: 'Refresh',
            total: 'Total {count}',
            truncation: 'Truncated',
            truncatedAtCap: 'Stopped at {count} rows',
            truncatedAtCapWithLimit: 'Stopped at {count} rows (limit {limit})',
            loadedRowsWarning: 'Loaded {count} rows',
        },
    },
}

const columns: TableColumn[] = [
    {name: 'id', type: 'INT'},
    {name: 'name', type: 'VARCHAR'},
]

const rows: TableRow[] = [
    {id: 1, name: 'alpha'},
    {id: 2, name: 'beta'},
]

function mountGrid(props: Record<string, unknown> = {}) {
    return mount(DataGrid, {
        props: {
            columns,
            rows,
            ...props,
        },
        global: {
            plugins: [
                createPinia(),
                createI18n({
                    locale: 'en',
                    messages,
                    legacy: false,
                    missingWarn: false,
                    fallbackWarn: false,
                }),
            ],
            stubs: {
                DwDataGrid: {
                    template: '<div class="dw-shell-stub"><slot name="toolbar-actions" /><slot name="toolbar-end" /></div>',
                },
                DwDataGridTable: true,
                GridColumnPanel: true,
                GridCellDetailDialog: true,
                GridRowFormView: true,
                GridDateTimePicker: true,
                GridExportDialog: true,
                GridClauseBar: true,
                IconButton: {
                    template: `<button :title="$attrs.title" :disabled="$attrs.disabled"><slot /></button>`,

                },
            },
        },
    })
}

describe('DataGrid baseline', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    it('renders the data grid shell', () => {
        const wrapper = mountGrid()
        expect(wrapper.find('.data-grid').exists()).toBe(true)
        expect(wrapper.find('.dw-shell-stub').exists()).toBe(true)
    })

    it('renders a refresh action in full toolbar mode', async () => {
        const wrapper = mountGrid({fullToolbar: true})
        expect(wrapper.find('button[title="Refresh"]').exists()).toBe(true)
    })

    it('emits refresh when the toolbar action is clicked', async () => {
        const wrapper = mountGrid({fullToolbar: true})
        await wrapper.find('button[title="Refresh"]').trigger('click')
        expect(wrapper.emitted('refresh')).toHaveLength(1)
    })

    it('shows the truncation hint when results hit a hard cap', () => {
        const wrapper = mountGrid({fullToolbar: true, truncatedAtCap: true, truncatedCapRows: 100})
        const hint = wrapper.find('.loaded-rows-hint--warn')
        expect(hint.exists()).toBe(true)
        expect(hint.text()).toContain('limit 100')
    })

    it('shows the read-only hint when provided', () => {
        const wrapper = mountGrid({fullToolbar: true, readOnlyHint: 'Source does not support DML'})
        const hint = wrapper.find('.grid-hint-tip')
        expect(hint.exists()).toBe(true)
        expect(hint.attributes('title')).toBe('Source does not support DML')
    })

    it('renders the editable action group when editable', () => {
        const wrapper = mountGrid({fullToolbar: true, editable: true})
        expect(wrapper.find('[role="group"]').exists()).toBe(true)
    })
})
