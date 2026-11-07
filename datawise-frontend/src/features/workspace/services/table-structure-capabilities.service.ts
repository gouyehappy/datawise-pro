import type {DbType} from '@/core/types'
import {supportsAlterColumnWizard} from '@/features/workspace/services/alter-column-ddl.service'

export interface TableStructureCapabilities {
    addColumn: boolean
    dropColumn: boolean
    renameColumn: boolean
    alterType: boolean
    alterNullability: boolean
    alterDefault: boolean
    comment: boolean
    /** Physical FIRST/AFTER reorder (MySQL/MariaDB only). */
    reorderColumn: boolean
    showCharacterSet: boolean
    showExtendedAttrs: boolean
    /** Editable PK checkbox that feeds column DDL (MySQL-family). */
    primaryKeyToggle: boolean
}

const DISABLED: TableStructureCapabilities = {
    addColumn: false,
    dropColumn: false,
    renameColumn: false,
    alterType: false,
    alterNullability: false,
    alterDefault: false,
    comment: false,
    reorderColumn: false,
    showCharacterSet: false,
    showExtendedAttrs: false,
    primaryKeyToggle: false,
}

const MYSQL_FAMILY = new Set<DbType>(['mysql', 'mariadb'])
const PG_FAMILY = new Set<DbType>([
    'postgresql',
    'kingbase',
    'greenplum',
    'opengauss',
    'highgo',
])

function caps(partial: Partial<TableStructureCapabilities>): TableStructureCapabilities {
    return {...DISABLED, ...partial}
}

/** Capability matrix for the table structure column editor (wizard dialects only). */
export function getTableStructureCapabilities(dbType: DbType | undefined): TableStructureCapabilities {
    if (!supportsAlterColumnWizard(dbType) || !dbType) return DISABLED

    if (MYSQL_FAMILY.has(dbType)) {
        return caps({
            addColumn: true,
            dropColumn: true,
            renameColumn: true,
            alterType: true,
            alterNullability: true,
            alterDefault: true,
            comment: true,
            reorderColumn: true,
            showCharacterSet: true,
            showExtendedAttrs: true,
            primaryKeyToggle: true,
        })
    }

    if (PG_FAMILY.has(dbType)) {
        return caps({
            addColumn: true,
            dropColumn: true,
            renameColumn: true,
            alterType: true,
            alterNullability: true,
            alterDefault: true,
            comment: true,
        })
    }

    if (dbType === 'sqlserver') {
        return caps({
            addColumn: true,
            dropColumn: true,
            renameColumn: true,
            alterType: true,
            alterNullability: true,
            alterDefault: true,
        })
    }

    if (dbType === 'oracle' || dbType === 'dm') {
        return caps({
            addColumn: true,
            dropColumn: true,
            renameColumn: true,
            alterType: true,
            alterNullability: true,
            alterDefault: true,
            comment: true,
        })
    }

    return DISABLED
}

export function isMysqlFamilyStructureDb(dbType: DbType | undefined): boolean {
    return !!dbType && MYSQL_FAMILY.has(dbType)
}
