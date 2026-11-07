import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {nextViewModelTabName, isValidViewModelBaseName, stripViewModelDisplayName} from '../../features/explorer/services/view-model-naming.ts'
import {
    isSingleViewModelStatement,
    isViewModelSelectSql,
} from '../../features/explorer/services/view-model-sql.ts'
import {getContextMenuForNodeType} from '../../features/explorer/constants/context-menus.ts'

const t = ((key: string) => key) as never

describe('view-model.service', () => {
    it('accepts select and with queries', () => {
        assert.equal(isViewModelSelectSql('SELECT 1'), true)
        assert.equal(isViewModelSelectSql('with cte as (select 1) select * from cte'), true)
    })

    it('rejects dml and explain', () => {
        assert.equal(isViewModelSelectSql('UPDATE t SET x = 1'), false)
        assert.equal(isViewModelSelectSql('EXPLAIN SELECT 1'), false)
        assert.equal(isViewModelSelectSql(''), false)
    })

    it('requires a single select statement', () => {
        assert.equal(isSingleViewModelStatement('SELECT 1', ['SELECT 1']), true)
        assert.equal(isSingleViewModelStatement('SELECT 1; SELECT 2', ['SELECT 1', 'SELECT 2']), false)
    })
})

describe('view_model naming', () => {
    it('allocates model_01 model_02 sequentially', () => {
        assert.equal(nextViewModelTabName([]), 'model_01')
        assert.equal(nextViewModelTabName(['model_01']), 'model_02')
        assert.equal(nextViewModelTabName(['model_01.view.sql', 'model_03']), 'model_04')
    })

    it('validates view model names like table/sql file names', () => {
        assert.equal(isValidViewModelBaseName('model_01'), true)
        assert.equal(isValidViewModelBaseName('sales_summary'), true)
        assert.equal(isValidViewModelBaseName('智能分群'), true)
        assert.equal(isValidViewModelBaseName('01_model'), false)
        assert.equal(isValidViewModelBaseName(''), false)
        assert.equal(isValidViewModelBaseName('-'), false)
        assert.equal(stripViewModelDisplayName('foo.view.sql'), 'foo')
    })
})

describe('view_model context menu', () => {
    it('includes open data and migrate entries', () => {
        const items = getContextMenuForNodeType('view_model', t)
        const ids = items.map((item) => item.id)
        assert.ok(ids.includes('open'))
        assert.ok(ids.includes('edit-view-model'))
        assert.ok(ids.includes('migrate-data'))
    })

    it('models folder includes new view model action', () => {
        const items = getContextMenuForNodeType('folder-models', t)
        assert.ok(items.some((item) => item.id === 'new-view-model'))
    })
})
