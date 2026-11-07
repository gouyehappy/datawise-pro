import type {DbType} from '@/core/types'
import {
    buildQualifiedTableName,
    quoteSqlIdentifier,
} from '@/features/connection/services/db-type-quotes'

export interface SchemaErFkDraft {
    sourceTable: string
    sourceColumn: string
    targetTable: string
    targetColumn: string
    constraintName?: string
}

function defaultConstraintName(draft: SchemaErFkDraft): string {
    const raw = draft.constraintName?.trim()
        || `fk_${draft.sourceTable}_${draft.sourceColumn}_${draft.targetTable}`
    return raw.replace(/[^\w]+/g, '_').slice(0, 60).toLowerCase()
}

function isMysqlFamily(dbType?: DbType): boolean {
    return dbType === 'mysql'
        || dbType === 'mariadb'
        || dbType === 'tidb'
        || dbType === 'oceanbase'
}

function isPostgresFamily(dbType?: DbType): boolean {
    return dbType === 'postgresql'
        || dbType === 'kingbase'
        || dbType === 'greenplum'
        || dbType === 'opengauss'
        || dbType === 'gaussdb'
        || dbType === 'highgo'
}

/** 生成 ADD FOREIGN KEY DDL（预览用，不自动执行） */
export function buildAddForeignKeySql(
    draft: SchemaErFkDraft,
    options: {dbType?: DbType; database?: string},
): string {
    const sourceTable = draft.sourceTable.trim()
    const targetTable = draft.targetTable.trim()
    const sourceColumn = draft.sourceColumn.trim()
    const targetColumn = draft.targetColumn.trim()
    if (!sourceTable || !targetTable || !sourceColumn || !targetColumn) return ''

    const dbType = options.dbType
    const database = options.database
    const qualifiedSource = buildQualifiedTableName(dbType, database ?? '', sourceTable)
    const qualifiedTarget = buildQualifiedTableName(dbType, database ?? '', targetTable)
    const srcCol = quoteSqlIdentifier(dbType, sourceColumn)
    const tgtCol = quoteSqlIdentifier(dbType, targetColumn)
    const constraint = quoteSqlIdentifier(dbType, defaultConstraintName(draft))

    return [
        `-- ER: add foreign key ${sourceTable}.${sourceColumn} → ${targetTable}.${targetColumn}`,
        `ALTER TABLE ${qualifiedSource}`,
        `  ADD CONSTRAINT ${constraint}`,
        `  FOREIGN KEY (${srcCol}) REFERENCES ${qualifiedTarget} (${tgtCol});`,
    ].join('\n')
}

/** 生成 DROP FOREIGN KEY / DROP CONSTRAINT DDL */
export function buildDropForeignKeySql(
    draft: SchemaErFkDraft,
    options: {dbType?: DbType; database?: string},
): string {
    const sourceTable = draft.sourceTable.trim()
    const constraintRaw = draft.constraintName?.trim() || defaultConstraintName(draft)
    if (!sourceTable || !constraintRaw) return ''

    const dbType = options.dbType
    const database = options.database
    const qualifiedSource = buildQualifiedTableName(dbType, database ?? '', sourceTable)
    const constraint = quoteSqlIdentifier(dbType, constraintRaw)

    const header = `-- ER: drop foreign key ${constraintRaw} on ${sourceTable}`
    if (isMysqlFamily(dbType)) {
        return `${header}\nALTER TABLE ${qualifiedSource} DROP FOREIGN KEY ${constraint};`
    }
    if (isPostgresFamily(dbType) || dbType === 'oracle' || dbType === 'dm' || dbType === 'dameng' || dbType === 'sqlserver') {
        return `${header}\nALTER TABLE ${qualifiedSource} DROP CONSTRAINT ${constraint};`
    }
    return `${header}\nALTER TABLE ${qualifiedSource} DROP CONSTRAINT ${constraint};`
}

export function suggestFkConstraintName(draft: Omit<SchemaErFkDraft, 'constraintName'>): string {
    return defaultConstraintName({...draft})
}
