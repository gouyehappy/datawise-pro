import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    categoryCompletionLabel,
    columnCompletionLabel,
    completionItemKind,
    formatColumnCommentHint,
    functionCompletionLabel,
    hintCompletionPresentation,
    tableCompletionLabel,
    tableAliasPreview,
} from '../completion/completion-labels.ts'

describe('completion-labels — rich suggest presentation', () => {
    it('maps categories to Monaco icon kinds', () => {
        assert.equal(completionItemKind('catalog'), 8)
        assert.equal(completionItemKind('schema'), 7)
        assert.equal(completionItemKind('table'), 6)
        assert.equal(completionItemKind('column'), 3)
        assert.equal(completionItemKind('function'), 1)
        assert.equal(completionItemKind('keyword'), 17)
        assert.equal(completionItemKind('snippet'), 28)
        assert.equal(completionItemKind('alias'), 4)
        assert.equal(completionItemKind('fk'), 21)
        assert.equal(completionItemKind('expand'), 10)
        assert.equal(completionItemKind('ai'), 25)
        assert.equal(completionItemKind('recent'), 15)
        assert.equal(completionItemKind('value_string'), 14)
    })

    it('column label keeps clean single-column presentation', () => {
        const label = columnCompletionLabel('create_by', {type: 'varchar(64)'}, 'Column')
        assert.equal(label.label, 'create_by')
        assert.equal(label.detail, undefined)
        assert.equal(label.description, 'varchar(64)')
    })

    it('column label shows table alias and PK beside name; type on the right', () => {
        const label = columnCompletionLabel('id', {type: 'BIGINT', pk: true}, 'Column', 'cdt')
        assert.equal(label.label, 'id')
        assert.equal(label.detail, '(cdt) · PK')
        assert.equal(label.description, 'bigint')
    })

    it('column label shows FK beside name when option set', () => {
        const label = columnCompletionLabel(
            'user_id',
            {type: 'bigint', pk: false},
            'COL',
            'o',
            {fk: true},
        )
        assert.equal(label.detail, '(o) · FK')
        assert.equal(label.description, 'bigint')
    })

    it('column comment hint truncates; only shown when showComment', () => {
        assert.equal(formatColumnCommentHint('订单状态'), '订单状态')
        assert.equal(
            formatColumnCommentHint('这是一段很长很长很长的字段业务注释说明'),
            '这是一段很长很长很长的字段业务…',
        )
        const off = columnCompletionLabel(
            'status',
            {type: 'varchar(32)', comment: '订单状态'},
            'COL',
        )
        assert.equal(off.detail, undefined)
        const on = columnCompletionLabel(
            'status',
            {type: 'varchar(32)', comment: '订单状态'},
            'COL',
            undefined,
            {showComment: true},
        )
        assert.equal(on.detail, '订单状态')
        assert.equal(on.description, 'varchar(32)')
    })

    it('table label does not render alias preview in title', () => {
        const label = tableCompletionLabel('app_ai_config', 'Table', 'aac')
        assert.equal(label.label, 'app_ai_config')
        assert.equal(label.detail, undefined)
        assert.equal(label.description, 'Table')
    })

    it('table label shows catalog in parentheses', () => {
        const label = tableCompletionLabel('orders', 'Table', 'ord', 'shop_db')
        assert.equal(label.label, 'orders')
        assert.equal(label.detail, '(shop_db)')
        assert.equal(label.description, 'Table')
    })

    it('table label keeps short badge on the right; alias hint beside name', () => {
        const label = tableCompletionLabel(
            'orders',
            'TBL',
            'ord',
            'shop_db',
            'Table · alias ord | Foreign key',
        )
        assert.equal(label.description, 'TBL')
        assert.equal(label.detail, '(shop_db) → ord · FK')
    })

    it('table label abbreviates zh alias hint beside name', () => {
        const label = tableCompletionLabel('product', 'TBL', undefined, undefined, '表 · 别名 pr')
        assert.equal(label.description, 'TBL')
        assert.equal(label.detail, '→ pr')
    })

    it('table label shows truncated comment when enabled', () => {
        const off = tableCompletionLabel(
            'order_detail',
            'TBL',
            undefined,
            'aaflinktest',
            'Table · alias od',
            {comment: '订单明细表', showComment: false},
        )
        assert.equal(off.detail, '(aaflinktest) → od')
        const on = tableCompletionLabel(
            'order_detail',
            'TBL',
            undefined,
            'aaflinktest',
            'Table · alias od',
            {comment: '订单明细表', showComment: true},
        )
        assert.equal(on.detail, '(aaflinktest) → od 订单明细表')
    })

    it('function label merges signature and shows return type in description', () => {
        const label = functionCompletionLabel('SUM', 'Function', '([DISTINCT] expr)', 'number')
        assert.equal(label.label, 'SUM([DISTINCT] expr)')
        assert.equal(label.detail, undefined)
        assert.equal(label.description, 'number')
    })

    it('extracts alias preview from insert text', () => {
        assert.equal(tableAliasPreview('app_ai_config aac', 'app_ai_config'), 'aac')
        assert.equal(tableAliasPreview('users', 'users'), undefined)
    })

    it('category label supports inline detail', () => {
        const label = categoryCompletionLabel('status', 'Value', ' · int')
        assert.equal(label.label, 'status')
        assert.equal(label.detail, ' · int')
        assert.equal(label.description, 'Value')
    })

    it('predicate value: short badge on right, column type beside name', () => {
        const {label, detail} = hintCompletionPresentation(
            '123',
            'Numeric placeholder · int',
            'NUM',
            'int',
        )
        assert.equal(label.label, '123')
        assert.equal(label.detail, 'int')
        assert.equal(label.description, 'NUM')
        assert.equal(detail, 'Numeric placeholder · int')
    })

    it('FK join: condition beside name, FK badge on right', () => {
        const label = categoryCompletionLabel(
            '→ users',
            'FK',
            'o.user_id = u.id',
        )
        assert.equal(label.label, '→ users')
        assert.equal(label.detail, 'o.user_id = u.id')
        assert.equal(label.description, 'FK')
    })
})
