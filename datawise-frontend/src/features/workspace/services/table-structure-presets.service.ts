import type {DbType} from '@/core/types'
import {isMysqlFamilyStructureDb} from '@/features/workspace/services/table-structure-capabilities.service'

export type StructurePresetOption = {
    value: string
    label?: string
    toneClass?: string
}

/** Default-value shortcuts for the structure editor (dbx-style presets). */
export function getColumnDefaultPresets(dbType?: DbType): StructurePresetOption[] {
    const base: StructurePresetOption[] = [
        {value: "''", label: "''", toneClass: 'is-def-string'},
        {value: 'NULL', label: 'NULL', toneClass: 'is-def-null'},
        {value: '0', label: '0', toneClass: 'is-def-num'},
        {value: '1', label: '1', toneClass: 'is-def-num'},
    ]
    if (isMysqlFamilyStructureDb(dbType) || !dbType) {
        return [
            ...base,
            {value: 'CURRENT_TIMESTAMP', label: 'CURRENT_TIMESTAMP', toneClass: 'is-def-time'},
            {value: 'CURRENT_DATE', label: 'CURRENT_DATE', toneClass: 'is-def-time'},
            {value: 'CURRENT_TIME', label: 'CURRENT_TIME', toneClass: 'is-def-time'},
        ]
    }
    if (
        dbType === 'postgresql'
        || dbType === 'kingbase'
        || dbType === 'greenplum'
        || dbType === 'opengauss'
        || dbType === 'highgo'
    ) {
        return [
            ...base,
            {value: 'CURRENT_TIMESTAMP', label: 'CURRENT_TIMESTAMP', toneClass: 'is-def-time'},
            {value: 'CURRENT_DATE', label: 'CURRENT_DATE', toneClass: 'is-def-time'},
            {value: 'now()', label: 'now()', toneClass: 'is-def-time'},
        ]
    }
    return [
        ...base,
        {value: 'CURRENT_TIMESTAMP', label: 'CURRENT_TIMESTAMP', toneClass: 'is-def-time'},
    ]
}

const MYSQL_CHARSETS = [
    'utf8mb4',
    'utf8mb3',
    'utf8',
    'latin1',
    'ascii',
    'binary',
    'gbk',
    'gb18030',
    'big5',
    'ucs2',
    'utf16',
    'utf16le',
    'utf32',
]

const MYSQL_COLLATIONS: Record<string, string[]> = {
    utf8mb4: [
        'utf8mb4_general_ci',
        'utf8mb4_unicode_ci',
        'utf8mb4_0900_ai_ci',
        'utf8mb4_bin',
        'utf8mb4_unicode_520_ci',
    ],
    utf8: ['utf8_general_ci', 'utf8_unicode_ci', 'utf8_bin'],
    utf8mb3: ['utf8mb3_general_ci', 'utf8mb3_unicode_ci', 'utf8mb3_bin'],
    latin1: ['latin1_swedish_ci', 'latin1_bin', 'latin1_general_ci'],
    ascii: ['ascii_general_ci', 'ascii_bin'],
    binary: ['binary'],
    gbk: ['gbk_chinese_ci', 'gbk_bin'],
    gb18030: ['gb18030_chinese_ci', 'gb18030_bin'],
}

export function getMysqlCharsetOptions(): string[] {
    return [...MYSQL_CHARSETS]
}

export function getMysqlCollationOptions(charset?: string): string[] {
    const key = (charset ?? '').trim().toLowerCase()
    if (key && MYSQL_COLLATIONS[key]) return [...MYSQL_COLLATIONS[key]!]
    return Object.values(MYSQL_COLLATIONS).flat()
}
