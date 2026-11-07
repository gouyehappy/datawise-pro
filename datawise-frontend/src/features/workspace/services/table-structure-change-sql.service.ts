import type {DbType} from '@/core/types'
import {
    buildAlterColumnSql,
    buildBatchCommentColumnDdl,
    type AlterColumnSpec,
} from '@/features/workspace/services/alter-column-ddl.service'
import {
    columnChanged,
    columnPositionChanged,
    composeDraftDataType,
    type EditableColumnDraft,
} from '@/features/workspace/services/table-structure-draft.service'
import {
    getTableStructureCapabilities,
    isMysqlFamilyStructureDb,
} from '@/features/workspace/services/table-structure-capabilities.service'

function draftToSpec(
    draft: EditableColumnDraft,
    options?: {
        renameFrom?: string
        first?: boolean
        afterColumn?: string | null
        includePrimaryKey?: boolean
    },
): AlterColumnSpec {
    const name = options?.renameFrom?.trim() || draft.name.trim()
    const renameTo =
        options?.renameFrom && options.renameFrom.trim() !== draft.name.trim()
            ? draft.name.trim()
            : undefined
    return {
        name,
        dataType: composeDraftDataType(draft),
        nullable: draft.nullable,
        autoIncrement: draft.autoIncrement,
        defaultValue: draft.defaultValue.trim() ? draft.defaultValue.trim() : null,
        renameTo,
        comment: draft.comment,
        characterSet: draft.characterSet.trim() || null,
        collation: draft.collation.trim() || null,
        onUpdateCurrentTimestamp: draft.onUpdateCurrentTimestamp,
        generated: draft.generated
            ? {
                  expression: draft.generated.expression,
                  storage: draft.generated.storage,
              }
            : null,
        first: options?.first,
        afterColumn: options?.afterColumn,
        primaryKey: options?.includePrimaryKey ? draft.primaryKey : undefined,
    }
}

function resolveMysqlPosition(
    drafts: EditableColumnDraft[],
    draft: EditableColumnDraft,
): {first?: boolean; afterColumn?: string | null} {
    const active = drafts.filter((item) => !item.markedForDrop)
    const index = active.findIndex((item) => item.id === draft.id)
    if (index <= 0) return {first: true}
    const prev = active[index - 1]
    const afterName = prev?.name?.trim()
    return afterName ? {afterColumn: afterName} : {}
}

function needsMysqlPositionClause(
    drafts: EditableColumnDraft[],
    draft: EditableColumnDraft,
    dbType: DbType | undefined,
): boolean {
    if (!isMysqlFamilyStructureDb(dbType)) return false
    if (!draft.original) return true
    return columnPositionChanged(drafts, draft)
}

/**
 * Diff column drafts against originals and emit ALTER statements.
 * Returns empty string when nothing changed.
 */
export function buildTableStructureChangeSql(options: {
    dbType?: DbType
    tableName: string
    database?: string
    drafts: EditableColumnDraft[]
}): string {
    const tableName = options.tableName.trim()
    if (!tableName) return ''
    const caps = getTableStructureCapabilities(options.dbType)
    if (!caps.addColumn && !caps.dropColumn && !caps.alterType) return ''

    const drafts = options.drafts
    const statements: string[] = []
    const commentOnly: {name: string; comment: string}[] = []
    const mysql = isMysqlFamilyStructureDb(options.dbType)

    for (const draft of drafts) {
        if (draft.markedForDrop && draft.original) {
            if (!caps.dropColumn) continue
            const sql = buildAlterColumnSql('drop', {
                dbType: options.dbType,
                tableName,
                database: options.database,
                column: {name: draft.original.name, dataType: '', nullable: true},
            })
            if (sql) statements.push(sql)
            continue
        }
        if (draft.markedForDrop) continue

        const name = draft.name.trim()
        if (!name || !draft.baseType.trim()) continue

        // New column
        if (!draft.original) {
            if (!caps.addColumn) continue
            const position =
                caps.reorderColumn && mysql ? resolveMysqlPosition(drafts, draft) : {}
            const sql = buildAlterColumnSql('add', {
                dbType: options.dbType,
                tableName,
                database: options.database,
                column: draftToSpec(draft, {
                    ...position,
                    includePrimaryKey: caps.primaryKeyToggle && draft.primaryKey,
                }),
            })
            if (sql) statements.push(sql)
            continue
        }

        const attrChanged = columnChanged(draft, options.dbType)
        const posChanged = caps.reorderColumn && needsMysqlPositionClause(drafts, draft, options.dbType)
        if (!attrChanged && !posChanged) continue

        const originalName = draft.original.name
        const renamed = caps.renameColumn && name !== originalName
        const position = posChanged ? resolveMysqlPosition(drafts, draft) : {}

        if (mysql) {
            const sql = buildAlterColumnSql('modify', {
                dbType: options.dbType,
                tableName,
                database: options.database,
                column: draftToSpec(draft, {
                    renameFrom: renamed ? originalName : undefined,
                    ...position,
                    includePrimaryKey: false,
                }),
            })
            if (sql) statements.push(sql)
            continue
        }

        if (renamed) {
            const renameSql = buildAlterColumnSql('rename', {
                dbType: options.dbType,
                tableName,
                database: options.database,
                column: {
                    name: originalName,
                    dataType: '',
                    nullable: true,
                    renameTo: name,
                },
            })
            if (renameSql) statements.push(renameSql)
        }

        const typeOrNullOrDefaultChanged =
            composeDraftDataType(draft).toLowerCase()
                !== (draft.original.dataType || '').trim().toLowerCase()
            || draft.nullable !== draft.original.nullable
            || (draft.defaultValue.trim() || '')
                !== (draft.original.defaultValue != null ? String(draft.original.defaultValue).trim() : '')
            || draft.autoIncrement !== draft.original.autoIncrement

        if (typeOrNullOrDefaultChanged) {
            const sql = buildAlterColumnSql('modify', {
                dbType: options.dbType,
                tableName,
                database: options.database,
                column: draftToSpec(draft),
            })
            if (sql) statements.push(sql)
        }

        const commentChanged =
            caps.comment
            && (draft.comment.trim() || '') !== (draft.original.comment ?? '').trim()
        if (commentChanged) {
            commentOnly.push({name, comment: draft.comment})
        }
    }

    if (commentOnly.length > 0) {
        const commentSql = buildBatchCommentColumnDdl({
            dbType: options.dbType,
            tableName,
            database: options.database,
            comments: commentOnly,
            columnMeta: drafts
                .filter((d) => d.original && !d.markedForDrop)
                .map((d) => ({
                    name: d.name.trim() || d.original!.name,
                    dataType: composeDraftDataType(d) || d.original!.dataType,
                    nullable: d.nullable,
                })),
        })
        if (commentSql) statements.push(commentSql)
    }

    return statements.join('\n')
}

/** True when drafts imply physical reorder but dialect cannot emit AFTER/FIRST. */
export function hasUnsupportedPhysicalReorder(
    drafts: EditableColumnDraft[],
    dbType: DbType | undefined,
): boolean {
    const caps = getTableStructureCapabilities(dbType)
    if (caps.reorderColumn) return false
    return drafts.some((draft) => columnPositionChanged(drafts, draft))
}
