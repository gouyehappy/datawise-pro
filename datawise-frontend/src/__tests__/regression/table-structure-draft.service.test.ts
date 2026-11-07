import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TableColumnDetail} from '@/shared/api/types'
import {
    cloneColumnDraftAsNew,
    columnChanged,
    createColumnDraftFromDetail,
    createEmptyColumnDraft,
    isDraftDirty,
    markOrRemoveColumn,
    parseMysqlGeneratedColumnExtra,
    parseMysqlOnUpdateCurrentTimestamp,
} from '@/features/workspace/services/table-structure-draft.service'

function col(partial: Partial<TableColumnDetail> & Pick<TableColumnDetail, 'name'>): TableColumnDetail {
    return {
        ordinal: 1,
        name: partial.name,
        dataType: partial.dataType ?? 'varchar(10)',
        nullable: partial.nullable ?? true,
        autoIncrement: partial.autoIncrement ?? false,
        keyType: partial.keyType ?? null,
        defaultValue: partial.defaultValue ?? null,
        extra: partial.extra ?? null,
        comment: partial.comment ?? null,
        characterSet: partial.characterSet ?? null,
        collation: partial.collation ?? null,
    }
}

describe('table-structure-draft.service', () => {
    it('parses MySQL generated and on-update extras', () => {
        assert.equal(parseMysqlOnUpdateCurrentTimestamp('on update CURRENT_TIMESTAMP'), true)
        const generated = parseMysqlGeneratedColumnExtra(
            'GENERATED ALWAYS AS (`price` * `qty`) STORED',
        )
        assert.deepEqual(generated, {expression: '`price` * `qty`', storage: 'STORED'})
    })

    it('marks draft dirty on edit and soft-delete', () => {
        const draft = createColumnDraftFromDetail(col({name: 'a'}), 'mysql')
        assert.equal(columnChanged(draft, 'mysql'), false)
        draft.comment = 'x'
        assert.equal(columnChanged(draft, 'mysql'), true)
        draft.comment = ''
        draft.markedForDrop = true
        assert.equal(isDraftDirty([draft], 'mysql'), true)
    })

    it('clone clears PK and autoIncrement', () => {
        const source = createColumnDraftFromDetail(
            col({name: 'id', dataType: 'bigint', keyType: 'PRI', autoIncrement: true}),
            'mysql',
        )
        source.primaryKey = true
        const cloned = cloneColumnDraftAsNew(source, 'mysql')
        assert.equal(cloned.original, undefined)
        assert.equal(cloned.primaryKey, false)
        assert.equal(cloned.autoIncrement, false)
        assert.equal(cloned.name, 'id_copy')
    })

    it('markOrRemove toggles soft-delete and removes new columns', () => {
        const existing = createColumnDraftFromDetail(col({name: 'a'}), 'mysql')
        const neu = createEmptyColumnDraft('mysql')
        neu.name = 'b'
        let drafts = [existing, neu]
        drafts = markOrRemoveColumn(drafts, neu.id)
        assert.equal(drafts.length, 1)
        drafts = markOrRemoveColumn(drafts, existing.id)
        assert.equal(drafts[0]!.markedForDrop, true)
        drafts = markOrRemoveColumn(drafts, existing.id)
        assert.equal(drafts[0]!.markedForDrop, false)
    })
})
