import type {DbType} from '@/core/types'
import {
    buildQualifiedTableName,
    quoteSqlIdentifier,
} from '@/features/connection/services/sql-dialect.service'

export type AlterColumnOperation = 'add' | 'modify' | 'drop' | 'rename'

export interface ColumnGeneratedSpec {
    expression: string
    storage?: 'VIRTUAL' | 'STORED'
}

export interface AlterColumnSpec {
    name: string
    dataType: string
    nullable: boolean
    autoIncrement?: boolean
    defaultValue?: string | null
    /** Target name when operation is rename. */
    renameTo?: string
    comment?: string | null
    characterSet?: string | null
    collation?: string | null
    onUpdateCurrentTimestamp?: boolean
    generated?: ColumnGeneratedSpec | null
    /** MySQL ADD/MODIFY position: place FIRST. */
    first?: boolean
    /** MySQL ADD/MODIFY position: place AFTER this column name. */
    afterColumn?: string | null
    /** MySQL: include PRIMARY KEY in column definition (single-column PK adds). */
    primaryKey?: boolean
}

export interface RenameColumnSpec {
    from: string
    to: string
}

export interface CommentColumnSpec {
    name: string
    comment: string
}

/** Optional live column metadata used when MySQL MODIFY needs the current type. */
export interface CommentColumnMeta {
    name: string
    dataType: string
    nullable?: boolean
}

const PG_FAMILY = new Set<DbType>([
    'postgresql',
    'kingbase',
    'greenplum',
    'opengauss',
    'highgo',
])

const ALTER_WIZARD_DB_TYPES = new Set<DbType>([
    'mysql',
    'mariadb',
    'postgresql',
    'kingbase',
    'greenplum',
    'opengauss',
    'highgo',
    'sqlserver',
    'oracle',
    'dm',
])

export function supportsAlterColumnWizard(dbType: DbType | undefined): boolean {
    return !!dbType && ALTER_WIZARD_DB_TYPES.has(dbType)
}

function isPgFamily(dbType: DbType | undefined): boolean {
    return !!dbType && PG_FAMILY.has(dbType)
}

function quoteTable(dbType: DbType | undefined, tableName: string, database?: string): string {
    const table = tableName.trim()
    if (!table) return ''
    const db = database?.trim()
    if (!db) return quoteSqlIdentifier(dbType, table)
    return buildQualifiedTableName(dbType, db, table)
}

function formatDefaultClause(defaultValue?: string | null): string | null {
    if (defaultValue == null) return null
    const trimmed = String(defaultValue).trim()
    return trimmed ? `DEFAULT ${trimmed}` : null
}

function escapeSqlLiteral(value: string): string {
    return value.replace(/'/g, "''")
}

function formatMysqlPositionClause(dbType: DbType | undefined, column: AlterColumnSpec): string {
    if (dbType !== 'mysql' && dbType !== 'mariadb') return ''
    if (column.first) return ' FIRST'
    const after = column.afterColumn?.trim()
    if (after) return ` AFTER ${quoteSqlIdentifier(dbType, after)}`
    return ''
}

/**
 * MySQL/MariaDB column definition fragment (with identifier).
 * Order: name type [CHARACTER SET] [COLLATE] [GENERATED] [NULL|NOT NULL]
 * [DEFAULT] [AUTO_INCREMENT] [ON UPDATE] [COMMENT] [PRIMARY KEY]
 */
export function formatMysqlColumnDefinition(dbType: DbType | undefined, column: AlterColumnSpec): string {
    const name = quoteSqlIdentifier(dbType, column.name.trim())
    const parts = [name, column.dataType.trim()]
    const charset = column.characterSet?.trim()
    if (charset && (dbType === 'mysql' || dbType === 'mariadb')) {
        parts.push(`CHARACTER SET ${charset}`)
    }
    const collation = column.collation?.trim()
    if (collation && (dbType === 'mysql' || dbType === 'mariadb')) {
        parts.push(`COLLATE ${collation}`)
    }
    const generated = column.generated
    if (
        generated?.expression?.trim()
        && (dbType === 'mysql' || dbType === 'mariadb')
    ) {
        const storage = generated.storage === 'STORED' ? 'STORED' : 'VIRTUAL'
        parts.push(`GENERATED ALWAYS AS (${generated.expression.trim()}) ${storage}`)
    }
    if (!column.nullable) parts.push('NOT NULL')

    const hasGenerated = !!(generated?.expression?.trim())
    if (!hasGenerated) {
        const defaultClause = formatDefaultClause(column.defaultValue)
        if (defaultClause) parts.push(defaultClause)
    }
    if (column.autoIncrement && (dbType === 'mysql' || dbType === 'mariadb') && !hasGenerated) {
        parts.push('AUTO_INCREMENT')
    }
    if (
        column.onUpdateCurrentTimestamp
        && (dbType === 'mysql' || dbType === 'mariadb')
        && !hasGenerated
    ) {
        parts.push('ON UPDATE CURRENT_TIMESTAMP')
    }
    const comment = column.comment
    if (comment != null && String(comment).trim() && (dbType === 'mysql' || dbType === 'mariadb')) {
        parts.push(`COMMENT '${escapeSqlLiteral(String(comment).trim())}'`)
    }
    if (column.primaryKey && (dbType === 'mysql' || dbType === 'mariadb')) {
        parts.push('PRIMARY KEY')
    }
    return parts.join(' ')
}

function formatPgTypeClause(column: AlterColumnSpec): string {
    return column.dataType.trim()
}

/** 生成单列 ADD / MODIFY / DROP 的 ALTER TABLE SQL；校验失败返回 null */
export function buildAlterColumnSql(
    operation: AlterColumnOperation,
    options: {
        dbType?: DbType
        tableName: string
        database?: string
        column: AlterColumnSpec
    },
): string | null {
    const tableName = options.tableName.trim()
    const columnName = options.column.name.trim()
    if (!tableName || !columnName) return null

    const qualified = quoteTable(options.dbType, tableName, options.database)
    if (!qualified) return null

    const quotedColumn = quoteSqlIdentifier(options.dbType, columnName)

    if (operation === 'drop') {
        return `ALTER TABLE ${qualified} DROP COLUMN ${quotedColumn};`
    }

    if (operation === 'rename') {
        const renameTo = options.column.renameTo?.trim()
        if (!renameTo) return null
        const quotedTo = quoteSqlIdentifier(options.dbType, renameTo)
        if (options.dbType === 'sqlserver') {
            const objectName = options.database?.trim()
                ? `${options.database.trim()}.${tableName}.${columnName}`
                : `${tableName}.${columnName}`
            return `EXEC sp_rename N'${objectName.replace(/'/g, "''")}', N'${renameTo.replace(/'/g, "''")}', N'COLUMN';`
        }
        return `ALTER TABLE ${qualified} RENAME COLUMN ${quotedColumn} TO ${quotedTo};`
    }

    const dataType = options.column.dataType.trim()
    if (!dataType) return null

    if (operation === 'add') {
        if (isPgFamily(options.dbType)) {
            const parts = [`ALTER TABLE ${qualified} ADD COLUMN ${quotedColumn} ${dataType}`]
            if (!options.column.nullable) parts[0] += ' NOT NULL'
            const defaultClause = formatDefaultClause(options.column.defaultValue)
            if (defaultClause) parts[0] += ` ${defaultClause}`
            return `${parts[0]};`
        }
        if (options.dbType === 'sqlserver') {
            const parts = [`ALTER TABLE ${qualified} ADD ${quotedColumn} ${dataType}`]
            if (!options.column.nullable) parts[0] += ' NOT NULL'
            const defaultClause = formatDefaultClause(options.column.defaultValue)
            if (defaultClause) parts[0] += ` ${defaultClause}`
            return `${parts[0]};`
        }
        if (options.dbType === 'oracle' || options.dbType === 'dm') {
            return `ALTER TABLE ${qualified} ADD (${formatMysqlColumnDefinition(options.dbType, options.column)});`
        }
        const mysqlDef = formatMysqlColumnDefinition(options.dbType, options.column)
        const position = formatMysqlPositionClause(options.dbType, options.column)
        return `ALTER TABLE ${qualified} ADD COLUMN ${mysqlDef}${position};`
    }

    // modify
    if (isPgFamily(options.dbType)) {
        const lines = [
            `ALTER TABLE ${qualified} ALTER COLUMN ${quotedColumn} TYPE ${formatPgTypeClause(options.column)};`,
            options.column.nullable
                ? `ALTER TABLE ${qualified} ALTER COLUMN ${quotedColumn} DROP NOT NULL;`
                : `ALTER TABLE ${qualified} ALTER COLUMN ${quotedColumn} SET NOT NULL;`,
        ]
        const defaultValue = options.column.defaultValue
        if (defaultValue != null && String(defaultValue).trim()) {
            lines.push(
                `ALTER TABLE ${qualified} ALTER COLUMN ${quotedColumn} SET DEFAULT ${String(defaultValue).trim()};`,
            )
        } else {
            lines.push(`ALTER TABLE ${qualified} ALTER COLUMN ${quotedColumn} DROP DEFAULT;`)
        }
        return lines.join('\n')
    }

    if (options.dbType === 'sqlserver') {
        const parts = [quotedColumn, dataType]
        if (!options.column.nullable) parts.push('NOT NULL')
        const defaultClause = formatDefaultClause(options.column.defaultValue)
        if (defaultClause) parts.push(defaultClause)
        return `ALTER TABLE ${qualified} ALTER COLUMN ${parts.join(' ')};`
    }

    if (options.dbType === 'oracle' || options.dbType === 'dm') {
        return `ALTER TABLE ${qualified} MODIFY (${formatMysqlColumnDefinition(options.dbType, options.column)});`
    }

    // MySQL rename+modify uses CHANGE COLUMN; pure modify uses MODIFY COLUMN
    if (
        (options.dbType === 'mysql' || options.dbType === 'mariadb')
        && options.column.renameTo?.trim()
        && options.column.renameTo.trim() !== columnName
    ) {
        const renamed: AlterColumnSpec = {
            ...options.column,
            name: options.column.renameTo.trim(),
            renameTo: undefined,
        }
        const def = formatMysqlColumnDefinition(options.dbType, renamed)
        const position = formatMysqlPositionClause(options.dbType, options.column)
        return `ALTER TABLE ${qualified} CHANGE COLUMN ${quotedColumn} ${def}${position};`
    }

    const mysqlDef = formatMysqlColumnDefinition(options.dbType, options.column)
    const position = formatMysqlPositionClause(options.dbType, options.column)
    return `ALTER TABLE ${qualified} MODIFY COLUMN ${mysqlDef}${position};`
}

export type BatchAlterColumnOperation = 'drop' | 'add' | 'modify' | 'rename'

/** Concatenate per-column ALTER statements for a batch preview (no execution). */
export function buildBatchAlterColumnDdl(
    operation: BatchAlterColumnOperation,
    options: {
        dbType?: DbType
        tableName: string
        database?: string
        columnNames?: string[]
        columns?: AlterColumnSpec[]
        renames?: RenameColumnSpec[]
    },
): string | null {
    const tableName = options.tableName.trim()
    if (!tableName) return null

    if (operation === 'drop') {
        const names = (options.columnNames ?? []).map((name) => name.trim()).filter(Boolean)
        if (names.length === 0) return null
        const statements: string[] = []
        for (const name of names) {
            const sql = buildAlterColumnSql('drop', {
                dbType: options.dbType,
                tableName,
                database: options.database,
                column: {name, dataType: '', nullable: true},
            })
            if (sql) statements.push(sql)
        }
        return statements.length > 0 ? statements.join('\n') : null
    }

    if (operation === 'rename') {
        const renames = (options.renames ?? []).filter((item) => item.from.trim() && item.to.trim())
        if (renames.length === 0) return null
        const statements: string[] = []
        for (const item of renames) {
            const sql = buildAlterColumnSql('rename', {
                dbType: options.dbType,
                tableName,
                database: options.database,
                column: {
                    name: item.from.trim(),
                    dataType: '',
                    nullable: true,
                    renameTo: item.to.trim(),
                },
            })
            if (sql) statements.push(sql)
        }
        return statements.length > 0 ? statements.join('\n') : null
    }

    const columns = (options.columns ?? []).filter(
        (column) => column.name.trim() && column.dataType.trim(),
    )
    if (columns.length === 0) return null
    const statements: string[] = []
    for (const column of columns) {
        const sql = buildAlterColumnSql(operation === 'modify' ? 'modify' : 'add', {
            dbType: options.dbType,
            tableName,
            database: options.database,
            column: {
                name: column.name.trim(),
                dataType: column.dataType.trim(),
                nullable: column.nullable !== false,
                autoIncrement: column.autoIncrement,
                defaultValue: column.defaultValue,
            },
        })
        if (sql) statements.push(sql)
    }
    return statements.length > 0 ? statements.join('\n') : null
}

/** Parse lines like {@code note VARCHAR(64)} or {@code flag INT NOT NULL} into add/modify specs. */
export function parseBatchAddColumnLines(text: string): AlterColumnSpec[] {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const columns: AlterColumnSpec[] = []
    for (const line of lines) {
        const match = line.match(/^([A-Za-z_][\w$]*)\s+(.+?)(?:\s+NOT\s+NULL)?$/i)
        if (!match) continue
        const nullable = !/\bNOT\s+NULL\b/i.test(line)
        const dataType = match[2]!.replace(/\s+NOT\s+NULL\s*$/i, '').trim()
        if (!dataType) continue
        columns.push({name: match[1]!, dataType, nullable})
    }
    return columns
}

/** Same line format as {@link parseBatchAddColumnLines} — used for batch MODIFY previews. */
export function parseBatchModifyColumnLines(text: string): AlterColumnSpec[] {
    return parseBatchAddColumnLines(text)
}

/** Parse lines like {@code old_name new_name} or {@code old -> new} / {@code old TO new}. */
export function parseBatchRenameColumnLines(text: string): RenameColumnSpec[] {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const renames: RenameColumnSpec[] = []
    for (const line of lines) {
        const arrow = line.match(/^([A-Za-z_][\w$]*)\s*(?:->|=>|TO)\s*([A-Za-z_][\w$]*)$/i)
        if (arrow) {
            renames.push({from: arrow[1]!, to: arrow[2]!})
            continue
        }
        const spaced = line.match(/^([A-Za-z_][\w$]*)\s+([A-Za-z_][\w$]*)$/)
        if (spaced) {
            renames.push({from: spaced[1]!, to: spaced[2]!})
        }
    }
    return renames
}

/** Parse lines like {@code note: customer memo}, {@code note IS memo}, or {@code note 'memo'}. */
export function parseBatchCommentColumnLines(text: string): CommentColumnSpec[] {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const comments: CommentColumnSpec[] = []
    for (const line of lines) {
        const quoted = line.match(/^([A-Za-z_][\w$]*)\s+(['"])([\s\S]*)\2\s*$/)
        if (quoted) {
            comments.push({name: quoted[1]!, comment: quoted[3]!})
            continue
        }
        const marked = line.match(/^([A-Za-z_][\w$]*)\s*(?::|IS|=)\s*(.+)$/i)
        if (marked) {
            comments.push({name: marked[1]!, comment: marked[2]!.trim()})
            continue
        }
        const spaced = line.match(/^([A-Za-z_][\w$]*)\s+(.+)$/)
        if (spaced) {
            comments.push({name: spaced[1]!, comment: spaced[2]!.trim()})
        }
    }
    return comments.filter((item) => item.name && item.comment)
}

/**
 * Build COMMENT / MODIFY…COMMENT statements for a batch preview.
 * PostgreSQL-family / Oracle / DM use {@code COMMENT ON COLUMN};
 * MySQL / MariaDB use {@code MODIFY COLUMN … COMMENT} with current type from {@code columnMeta}.
 */
export function buildBatchCommentColumnDdl(options: {
    dbType?: DbType
    tableName: string
    database?: string
    comments: CommentColumnSpec[]
    columnMeta?: CommentColumnMeta[]
}): string | null {
    const tableName = options.tableName.trim()
    if (!tableName) return null
    const comments = (options.comments ?? []).filter((item) => item.name.trim())
    if (comments.length === 0) return null

    const qualified = quoteTable(options.dbType, tableName, options.database)
    if (!qualified) return null

    const metaByName = new Map(
        (options.columnMeta ?? []).map((column) => [column.name.toLowerCase(), column]),
    )
    const statements: string[] = []
    const dbType = options.dbType

    for (const item of comments) {
        const name = item.name.trim()
        const literal = escapeSqlLiteral(item.comment.trim())
        const quotedColumn = quoteSqlIdentifier(dbType, name)

        if (isPgFamily(dbType) || dbType === 'oracle' || dbType === 'dm') {
            statements.push(`COMMENT ON COLUMN ${qualified}.${quotedColumn} IS '${literal}';`)
            continue
        }

        if (dbType === 'mysql' || dbType === 'mariadb') {
            const meta = metaByName.get(name.toLowerCase())
            const dataType = meta?.dataType?.trim()
            if (!dataType) continue
            const nullClause = meta?.nullable === false ? ' NOT NULL' : ''
            statements.push(
                `ALTER TABLE ${qualified} MODIFY COLUMN ${quotedColumn} ${dataType}${nullClause} COMMENT '${literal}';`,
            )
            continue
        }
    }

    return statements.length > 0 ? statements.join('\n') : null
}
