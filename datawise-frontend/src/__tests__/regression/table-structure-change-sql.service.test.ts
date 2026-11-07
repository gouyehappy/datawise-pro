import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TableColumnDetail} from '@/shared/api/types'
import {buildTableStructureChangeSql} from '@/features/workspace/services/table-structure-change-sql.service'
import {
    createColumnDraftFromDetail,
    createEmptyColumnDraft,
    type EditableColumnDraft,
} from '@/features/workspace/services/table-structure-draft.service'

function col(
    partial: Partial<TableColumnDetail> & Pick<TableColumnDetail, 'name' | 'dataType'>,
): TableColumnDetail {
    return {
        ordinal: partial.ordinal ?? 1,
        name: partial.name,
        dataType: partial.dataType,
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

describe('buildTableStructureChangeSql', () => {
    it('returns empty when nothing changed', () => {
        const original = col({ordinal: 1, name: 'id', dataType: 'int', nullable: false})
        const drafts = [createColumnDraftFromDetail(original, 'mysql')]
        assert.equal(
            buildTableStructureChangeSql({
                dbType: 'mysql',
                tableName: 't',
                drafts,
            }),
            '',
        )
    })

    it('emits MySQL ADD with AFTER', () => {
        const id = createColumnDraftFromDetail(
            col({ordinal: 1, name: 'id', dataType: 'int', nullable: false}),
            'mysql',
        )
        const neu = createEmptyColumnDraft('mysql')
        neu.name = 'note'
        neu.baseType = 'varchar'
        neu.length = '64'
        neu.comment = 'memo'
        const drafts: EditableColumnDraft[] = [id, neu]
        const sql = buildTableStructureChangeSql({
            dbType: 'mysql',
            tableName: 't',
            database: 'db1',
            drafts,
        })
        assert.match(sql, /ADD COLUMN/)
        assert.match(sql, /`note`/)
        assert.match(sql, /varchar\(64\)/)
        assert.match(sql, /COMMENT 'memo'/)
        assert.match(sql, /AFTER `id`/)
    })

    it('emits MySQL DROP for soft-deleted original', () => {
        const draft = createColumnDraftFromDetail(
            col({ordinal: 1, name: 'old_col', dataType: 'int'}),
            'mysql',
        )
        draft.markedForDrop = true
        const sql = buildTableStructureChangeSql({
            dbType: 'mysql',
            tableName: 't',
            drafts: [draft],
        })
        assert.match(sql, /DROP COLUMN `old_col`/)
    })

    it('emits MySQL MODIFY when type changes', () => {
        const draft = createColumnDraftFromDetail(
            col({ordinal: 1, name: 'name', dataType: 'varchar(40)', nullable: false, comment: 'n'}),
            'mysql',
        )
        draft.length = '80'
        const sql = buildTableStructureChangeSql({
            dbType: 'mysql',
            tableName: 't',
            drafts: [draft],
        })
        assert.match(sql, /MODIFY COLUMN/)
        assert.match(sql, /varchar\(80\)/)
        assert.match(sql, /NOT NULL/)
    })

    it('emits MySQL CHANGE COLUMN on rename', () => {
        const draft = createColumnDraftFromDetail(
            col({ordinal: 1, name: 'old_name', dataType: 'varchar(10)'}),
            'mysql',
        )
        draft.name = 'new_name'
        const sql = buildTableStructureChangeSql({
            dbType: 'mysql',
            tableName: 't',
            drafts: [draft],
        })
        assert.match(sql, /CHANGE COLUMN `old_name`/)
        assert.match(sql, /`new_name`/)
    })

    it('emits PG type alter statements', () => {
        const draft = createColumnDraftFromDetail(
            col({ordinal: 1, name: 'age', dataType: 'integer', nullable: true}),
            'postgresql',
        )
        draft.baseType = 'bigint'
        draft.nullable = false
        const sql = buildTableStructureChangeSql({
            dbType: 'postgresql',
            tableName: 'people',
            drafts: [draft],
        })
        assert.match(sql, /ALTER COLUMN "age" TYPE bigint/)
        assert.match(sql, /SET NOT NULL/)
    })

    it('emits PG COMMENT ON COLUMN for comment-only change', () => {
        const draft = createColumnDraftFromDetail(
            col({ordinal: 1, name: 'age', dataType: 'integer', comment: 'a'}),
            'postgresql',
        )
        draft.comment = 'years'
        const sql = buildTableStructureChangeSql({
            dbType: 'postgresql',
            tableName: 'people',
            drafts: [draft],
        })
        assert.match(sql, /COMMENT ON COLUMN/)
        assert.match(sql, /'years'/)
    })
})
