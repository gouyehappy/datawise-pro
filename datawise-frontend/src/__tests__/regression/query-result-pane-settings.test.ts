import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    DEFAULT_QUERY_RESULT_PANE_SETTINGS,
    readStoredQueryResultPaneSettings,
    persistQueryResultPaneSettings,
    toDisplayResultIndex,
    toStorageResultIndex,
    columnDensityWidthScale,
    type QueryResultPaneSettings,
} from '@/features/workspace/services/query-result-pane-settings.service'
import {
    resolveGridColumnCommentLabel,
    resolveGridColumnTypeKind,
} from '@/core/data-grid/meta/column-meta'

describe('query-result-pane-settings.service', () => {
    it('maps newest-first display and storage indices', () => {
        assert.equal(toStorageResultIndex(0, 3, 'newest'), 2)
        assert.equal(toStorageResultIndex(2, 3, 'newest'), 0)
        assert.equal(toDisplayResultIndex(2, 3, 'newest'), 0)
        assert.equal(toDisplayResultIndex(0, 3, 'oldest'), 0)
        assert.equal(toStorageResultIndex(1, 3, 'oldest'), 1)
    })

    it('persists and reads settings from localStorage', () => {
        const key = 'dw-cli-query-result-pane-settings'
        const previous = globalThis.localStorage?.getItem(key) ?? null
        try {
            const next: QueryResultPaneSettings = {
                ...DEFAULT_QUERY_RESULT_PANE_SETTINGS,
                sortOrder: 'oldest',
                keepExistingResults: true,
                showFieldTypes: false,
                showFieldComments: false,
                columnDensity: 'compact',
                numericAlign: 'left',
                hideNullColumns: true,
                typeColoring: true,
            }
            persistQueryResultPaneSettings(next)
            assert.deepEqual(readStoredQueryResultPaneSettings(), next)
        } finally {
            if (previous == null) globalThis.localStorage?.removeItem(key)
            else globalThis.localStorage?.setItem(key, previous)
        }
    })
})

describe('resolveGridColumnCommentLabel', () => {
    it('reads comment from column details', () => {
        assert.equal(
            resolveGridColumnCommentLabel(
                {name: 'id'},
                [{ordinal: 1, name: 'id', dataType: 'int', nullable: false, autoIncrement: false, comment: '主键'}],
            ),
            '主键',
        )
        assert.equal(resolveGridColumnCommentLabel({name: 'id'}, []), '')
    })
})

describe('view option helpers', () => {
    it('scales column density widths', () => {
        assert.equal(columnDensityWidthScale('compact'), 0.82)
        assert.equal(columnDensityWidthScale('standard'), 1)
        assert.equal(columnDensityWidthScale('relaxed'), 1.18)
    })

    it('classifies column type kinds for coloring', () => {
        assert.equal(
            resolveGridColumnTypeKind(
                {name: 'price', type: 'decimal(10,2)'},
                [],
            ),
            'number',
        )
        assert.equal(
            resolveGridColumnTypeKind(
                {name: 'created', type: 'datetime'},
                [],
            ),
            'datetime',
        )
        assert.equal(
            resolveGridColumnTypeKind(
                {name: 'name', type: 'varchar(64)'},
                [],
            ),
            'string',
        )
    })
})
