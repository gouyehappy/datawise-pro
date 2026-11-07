import type {DbType} from '@/core/types'
import type {TableColumnDetail} from '@/shared/api/types'
import {
    composeColumnDataType,
    parseColumnDataType,
} from '@/features/workspace/services/column-data-type-options.service'
import {isMysqlFamilyStructureDb} from '@/features/workspace/services/table-structure-capabilities.service'

export type ColumnGeneratedStorage = 'VIRTUAL' | 'STORED'

export interface ColumnGeneratedDraft {
    expression: string
    storage: ColumnGeneratedStorage
}

export interface EditableColumnDraft {
    id: string
    name: string
    baseType: string
    length: string
    scale: string
    nullable: boolean
    primaryKey: boolean
    defaultValue: string
    comment: string
    autoIncrement: boolean
    onUpdateCurrentTimestamp: boolean
    generated: ColumnGeneratedDraft | null
    characterSet: string
    collation: string
    original?: TableColumnDetail
    originalOrdinal?: number
    markedForDrop: boolean
}

let draftIdSeq = 0

function nextDraftId(): string {
    draftIdSeq += 1
    return `col-draft-${draftIdSeq}-${Math.random().toString(36).slice(2, 8)}`
}

/** Parse MySQL EXTRA for GENERATED ALWAYS AS (…) VIRTUAL|STORED. */
export function parseMysqlGeneratedColumnExtra(
    extra: string | null | undefined,
): ColumnGeneratedDraft | null {
    if (!extra) return null
    const marker = 'generated always as'
    const lower = extra.toLowerCase()
    const index = lower.indexOf(marker)
    if (index < 0) return null
    const rest = extra.slice(index + marker.length).trimStart()
    if (!rest.startsWith('(')) return null
    const close = rest.lastIndexOf(')')
    if (close <= 0) return null
    const expression = rest.slice(1, close).trim()
    if (!expression) return null
    const tail = rest.slice(close + 1).trim().toUpperCase()
    const storage: ColumnGeneratedStorage =
        tail.startsWith('STORED') || tail.startsWith('PERSISTENT') ? 'STORED' : 'VIRTUAL'
    return {expression, storage}
}

export function parseMysqlOnUpdateCurrentTimestamp(extra: string | null | undefined): boolean {
    return !!extra && /on\s+update\s+current_timestamp/i.test(extra)
}

function isPrimaryKey(column: TableColumnDetail): boolean {
    const key = (column.keyType ?? '').trim().toUpperCase()
    return key === 'PRI' || key === 'PRIMARY'
}

export function createColumnDraftFromDetail(
    column: TableColumnDetail,
    dbType?: DbType,
): EditableColumnDraft {
    const parsed = parseColumnDataType(column.dataType || '')
    const mysql = isMysqlFamilyStructureDb(dbType)
    return {
        id: nextDraftId(),
        name: column.name,
        baseType: parsed.baseType,
        length: parsed.length ?? '',
        scale: parsed.scale ?? '',
        nullable: column.nullable,
        primaryKey: isPrimaryKey(column),
        defaultValue: column.defaultValue != null ? String(column.defaultValue) : '',
        comment: column.comment ?? '',
        autoIncrement: column.autoIncrement,
        onUpdateCurrentTimestamp: mysql ? parseMysqlOnUpdateCurrentTimestamp(column.extra) : false,
        generated: mysql ? parseMysqlGeneratedColumnExtra(column.extra) : null,
        characterSet: column.characterSet ?? '',
        collation: column.collation ?? '',
        original: column,
        originalOrdinal: column.ordinal,
        markedForDrop: false,
    }
}

export function createColumnDrafts(
    columns: TableColumnDetail[],
    dbType?: DbType,
): EditableColumnDraft[] {
    return columns.map((column) => createColumnDraftFromDetail(column, dbType))
}

export function defaultBaseTypeForDb(dbType?: DbType): string {
    if (!dbType) return 'varchar'
    if (dbType === 'oracle' || dbType === 'dm') return 'VARCHAR2'
    if (dbType === 'sqlserver') return 'varchar'
    return 'varchar'
}

export function createEmptyColumnDraft(dbType?: DbType): EditableColumnDraft {
    const baseType = defaultBaseTypeForDb(dbType)
    return {
        id: nextDraftId(),
        name: '',
        baseType,
        length: baseType.toLowerCase().includes('varchar') ? '255' : '',
        scale: '',
        nullable: true,
        primaryKey: false,
        defaultValue: '',
        comment: '',
        autoIncrement: false,
        onUpdateCurrentTimestamp: false,
        generated: null,
        characterSet: '',
        collation: '',
        markedForDrop: false,
    }
}

/** Duplicate as a new column (no original, clears PK / AI / identity-like flags). */
export function cloneColumnDraftAsNew(source: EditableColumnDraft, dbType?: DbType): EditableColumnDraft {
    const base = createEmptyColumnDraft(dbType)
    return {
        ...base,
        name: source.name ? `${source.name}_copy` : '',
        baseType: source.baseType || base.baseType,
        length: source.length,
        scale: source.scale,
        nullable: source.nullable,
        defaultValue: source.defaultValue,
        comment: source.comment,
        characterSet: source.characterSet,
        collation: source.collation,
        generated: source.generated
            ? {expression: source.generated.expression, storage: source.generated.storage}
            : null,
        onUpdateCurrentTimestamp: source.onUpdateCurrentTimestamp,
        primaryKey: false,
        autoIncrement: false,
        markedForDrop: false,
    }
}

export function composeDraftDataType(draft: EditableColumnDraft): string {
    return composeColumnDataType(draft.baseType, draft.length || null, draft.scale || null)
}

function norm(value: string | null | undefined): string {
    return (value ?? '').trim()
}

function sameGenerated(
    a: ColumnGeneratedDraft | null,
    b: ColumnGeneratedDraft | null,
): boolean {
    if (!a && !b) return true
    if (!a || !b) return false
    return a.expression.trim() === b.expression.trim() && a.storage === b.storage
}

/** Compare draft against its original snapshot (new columns always "changed"). */
export function columnChanged(draft: EditableColumnDraft, dbType?: DbType): boolean {
    if (draft.markedForDrop) return !!draft.original
    if (!draft.original) return true

    const original = createColumnDraftFromDetail(draft.original, dbType)
    if (norm(draft.name) !== norm(original.name)) return true
    if (composeDraftDataType(draft).toLowerCase() !== composeDraftDataType(original).toLowerCase()) {
        return true
    }
    if (draft.nullable !== original.nullable) return true
    // PK toggle on existing columns is display-only in v1 (ADD PRIMARY KEY is separate DDL).
    // New columns still carry primaryKey into ADD via includePrimaryKey.
    if (norm(draft.defaultValue) !== norm(original.defaultValue)) return true
    if (norm(draft.comment) !== norm(original.comment)) return true
    if (draft.autoIncrement !== original.autoIncrement) return true
    if (draft.onUpdateCurrentTimestamp !== original.onUpdateCurrentTimestamp) return true
    if (!sameGenerated(draft.generated, original.generated)) return true
    if (norm(draft.characterSet) !== norm(original.characterSet)) return true
    if (norm(draft.collation) !== norm(original.collation)) return true
    return false
}

export function columnPositionChanged(
    drafts: EditableColumnDraft[],
    draft: EditableColumnDraft,
): boolean {
    if (!draft.original || draft.markedForDrop) return false
    const active = drafts.filter((item) => !item.markedForDrop || !item.original)
    const currentIndex = active.findIndex((item) => item.id === draft.id)
    if (currentIndex < 0) return false
    const expectedOrdinal = draft.originalOrdinal
    if (expectedOrdinal == null) return false
    // Compare relative order among surviving originals by ordinal rank
    const originalsInDraftOrder = active
        .filter((item) => item.original && item.originalOrdinal != null)
        .map((item) => item.originalOrdinal!)
    const sortedOriginals = [...originalsInDraftOrder].sort((a, b) => a - b)
    const expectedIndex = sortedOriginals.indexOf(expectedOrdinal)
    const actualIndexAmongOriginals = active
        .filter((item) => item.original && item.originalOrdinal != null)
        .findIndex((item) => item.id === draft.id)
    return expectedIndex !== actualIndexAmongOriginals || currentIndex !== actualIndexAmongOriginals
}

export function isDraftDirty(drafts: EditableColumnDraft[], dbType?: DbType): boolean {
    return drafts.some(
        (draft) =>
            columnChanged(draft, dbType)
            || (isMysqlFamilyStructureDb(dbType) && columnPositionChanged(drafts, draft)),
    )
}

export function matchesColumnSearch(draft: EditableColumnDraft, query: string): boolean {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [draft.name, draft.comment, draft.baseType].some((value) =>
        value.toLowerCase().includes(q),
    )
}

/** Insert after `afterId` (or append). Returns new array. */
export function insertColumnDraft(
    drafts: EditableColumnDraft[],
    draft: EditableColumnDraft,
    afterId?: string | null,
): EditableColumnDraft[] {
    const next = [...drafts]
    if (!afterId) {
        next.push(draft)
        return next
    }
    const index = next.findIndex((item) => item.id === afterId)
    if (index < 0) {
        next.push(draft)
        return next
    }
    next.splice(index + 1, 0, draft)
    return next
}

/** Soft-delete existing columns; remove brand-new drafts. */
export function markOrRemoveColumn(
    drafts: EditableColumnDraft[],
    id: string,
): EditableColumnDraft[] {
    const target = drafts.find((item) => item.id === id)
    if (!target) return drafts
    if (!target.original) {
        return drafts.filter((item) => item.id !== id)
    }
    return drafts.map((item) =>
        item.id === id ? {...item, markedForDrop: !item.markedForDrop} : item,
    )
}

export function reorderColumnDrafts(
    drafts: EditableColumnDraft[],
    fromId: string,
    toId: string,
): EditableColumnDraft[] {
    if (fromId === toId) return drafts
    const fromIndex = drafts.findIndex((item) => item.id === fromId)
    const toIndex = drafts.findIndex((item) => item.id === toId)
    if (fromIndex < 0 || toIndex < 0) return drafts
    const next = [...drafts]
    const [moved] = next.splice(fromIndex, 1)
    if (!moved) return drafts
    next.splice(toIndex, 0, moved)
    return next
}
