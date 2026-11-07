import type {SqlSnippet} from '@sql-editor/types'

/** 常用 SQL 片段 — Tab 顺序：${1} 先定位表名 */
export type {SqlSnippet}
export const SQL_SNIPPETS: SqlSnippet[] = [
    {
        label: 'sel',
        insertText: 'SELECT ${2:*}\nFROM ${1:table} ${3:t1}\nWHERE ${4:1=1}',
        detail: 'Standard SELECT query template',
    },
    {
        label: 'selj',
        insertText:
            'SELECT ${4:t1.*}\nFROM ${1:table1} t1\nINNER JOIN ${2:table2} t2 ON ${3:t1.id = t2.id}\nWHERE ${5:1=1}',
        detail: 'SELECT with INNER JOIN template',
    },
    {
        label: 'self',
        insertText: 'SELECT ${2:*}\nFROM ${1:table} ${3:t1}\nWHERE ${4:1=1}\nLIMIT ${5:100}',
        detail: 'SELECT query with LIMIT',
    },
    {
        label: 'win',
        insertText:
            'ROW_NUMBER() OVER (PARTITION BY ${1:column} ORDER BY ${2:column} ${3|ASC,DESC|}) AS ${4:rn}',
        detail: 'ROW_NUMBER window function',
    },
    {
        label: 'uni',
        insertText: 'UNION ALL\nSELECT ${1:*}\nFROM ${2:table}',
        detail: 'UNION ALL append query',
    },
    {
        label: 'sub',
        insertText: 'FROM (\n  ${1:SELECT * FROM table WHERE 1=1}\n) ${2:sub}',
        detail: 'Derived table subquery',
    },
    {
        label: 'insel',
        insertText: 'INSERT INTO ${1:target_table} (${2:column})\nSELECT ${3:column}\nFROM ${4:source_table}\nWHERE ${5:1=1}',
        detail: 'INSERT … SELECT',
    },
    {
        label: 'lf',
        insertText: 'LEFT JOIN ${1:table} ${2:t2} ON ${3:t1.id = t2.id}',
        detail: 'LEFT JOIN … ON',
    },
    {
        label: 'cte',
        insertText:
            'WITH ${1:base} AS (\n  ${2:SELECT * FROM table WHERE 1=1}\n)\nSELECT ${3:*}\nFROM ${1:base}\nWHERE ${4:1=1}',
        detail: 'WITH … AS (…) SELECT',
    },
    {
        label: 'grp',
        insertText:
            'SELECT ${2:column}, COUNT(*) AS cnt\nFROM ${1:table} ${3:t1}\nWHERE ${4:1=1}\nGROUP BY ${2:column}\nHAVING COUNT(*) > ${5:0}\nORDER BY cnt DESC',
        detail: 'GROUP BY + HAVING aggregation',
    },
    {
        label: 'cnt',
        insertText: 'SELECT COUNT(*) AS total\nFROM ${1:table} ${2:t1}\nWHERE ${3:1=1}',
        detail: 'COUNT(*) aggregation query',
    },
    {
        label: 'lim',
        insertText: 'LIMIT ${1:100}',
        detail: 'LIMIT n',
    },
    {
        label: 'ord',
        insertText: 'ORDER BY ${1:column} ${2|ASC,DESC|}',
        detail: 'ORDER BY column',
    },
    {
        label: 'ins',
        insertText: 'INSERT INTO ${1:table} (${2:column})\nVALUES (${3:value})',
        detail: 'INSERT INTO … VALUES',
    },
    {
        label: 'upd',
        insertText: 'UPDATE ${1:table}\nSET ${2:column} = ${3:value}\nWHERE ${4:1=1}',
        detail: 'UPDATE … SET … WHERE',
    },
    {
        label: 'del',
        insertText: 'DELETE FROM ${1:table}\nWHERE ${2:1=1}',
        detail: 'DELETE FROM … WHERE',
    },
    {
        label: 'ex',
        insertText: 'EXPLAIN ${1:SELECT * FROM table WHERE 1=1}',
        detail: 'EXPLAIN execution plan',
    },
    {
        label: 'case',
        insertText: 'CASE\n  WHEN ${1:condition} THEN ${2:value}\n  ELSE ${3:NULL}\nEND',
        detail: 'CASE WHEN … END',
    },
    {
        label: 'in',
        insertText: 'IN (${1:value1}, ${2:value2})',
        detail: 'IN (…) list',
    },
    {
        label: 'exists',
        insertText: 'EXISTS (\n  ${1:SELECT 1 FROM table WHERE 1=1}\n)',
        detail: 'EXISTS subquery',
    },
    {
        label: 'crt',
        insertText:
            'CREATE TABLE ${1:table} (\n  ${2:id} BIGINT PRIMARY KEY,\n  ${3:created_at} DATETIME DEFAULT CURRENT_TIMESTAMP\n)',
        detail: 'CREATE TABLE',
    },
    {
        label: 'crtif',
        insertText:
            'CREATE TABLE IF NOT EXISTS ${1:table} (\n  ${2:id} BIGINT PRIMARY KEY,\n  ${3:created_at} DATETIME DEFAULT CURRENT_TIMESTAMP\n)',
        detail: 'CREATE TABLE IF NOT EXISTS',
    },
    {
        label: 'alt',
        insertText: 'ALTER TABLE ${1:table}\n  ADD COLUMN ${2:column} ${3:VARCHAR(255)} ${4|NOT NULL,DEFAULT NULL|}',
        detail: 'ALTER TABLE ADD COLUMN',
    },
    {
        label: 'altm',
        insertText: 'ALTER TABLE ${1:table}\n  MODIFY COLUMN ${2:column} ${3:VARCHAR(255)} ${4|NOT NULL,DEFAULT NULL|}',
        detail: 'ALTER TABLE MODIFY COLUMN',
    },
    {
        label: 'altd',
        insertText: 'ALTER TABLE ${1:table}\n  DROP COLUMN ${2:column}',
        detail: 'ALTER TABLE DROP COLUMN',
    },
    {
        label: 'cidx',
        insertText: 'CREATE INDEX ${1:idx_name} ON ${2:table} (${3:column})',
        detail: 'CREATE INDEX',
    },
    {
        label: 'drop',
        insertText: 'DROP TABLE ${1:table}',
        detail: 'DROP TABLE',
    },
    {
        label: 'drpi',
        insertText: 'DROP TABLE IF EXISTS ${1:table}',
        detail: 'DROP TABLE IF EXISTS',
    },
    {
        label: 'trunc',
        insertText: 'TRUNCATE TABLE ${1:table}',
        detail: 'TRUNCATE TABLE',
    },
    {
        label: 'ren',
        insertText: 'RENAME TABLE ${1:old_table} TO ${2:new_table}',
        detail: 'RENAME TABLE',
    },
    {
        label: 'cvw',
        insertText:
            'CREATE VIEW ${1:view_name} AS\nSELECT ${2:*}\nFROM ${3:table}\nWHERE ${4:1=1}',
        detail: 'CREATE VIEW',
    },
    {
        label: 'insm',
        insertText:
            'INSERT INTO ${1:table} (${2:column})\nVALUES\n  (${3:value}),\n  (${4:value})',
        detail: 'INSERT multi-row VALUES',
    },
    {
        label: 'delj',
        insertText:
            'DELETE ${1:t1}\nFROM ${2:table1} ${1:t1}\nINNER JOIN ${3:table2} ${4:t2} ON ${5:t1.id = t2.id}\nWHERE ${6:1=1}',
        detail: 'DELETE with JOIN',
    },
]

export const SQL_SLOT_SNIPPETS: Partial<Record<string, SqlSnippet[]>> = {
    join: [
        {
            label: 'lf',
            insertText: 'LEFT JOIN ${1:table} ${2:t2} ON ${3:t1.id = t2.id}',
            detail: 'LEFT JOIN',
        },
        {
            label: 'ij',
            insertText: 'INNER JOIN ${1:table} ${2:t2} ON ${3:t1.id = t2.id}',
            detail: 'INNER JOIN',
        },
    ],
    on: [
        {
            label: 'eq',
            insertText: '${1:t1}.${2:column} = ${3:t2}.${4:column}',
            detail: 't1.col = t2.col',
        },
    ],
    where: [
        {
            label: 'ord',
            insertText: 'ORDER BY ${1:column} ${2|ASC,DESC|}',
            detail: 'ORDER BY',
        },
        {
            label: 'in',
            insertText: '${1:column} IN (${2:value1}, ${3:value2})',
            detail: 'column IN (…)',
        },
        {
            label: 'like',
            insertText: "${1:column} LIKE '${2:%value%}'",
            detail: 'column LIKE',
        },
        {
            label: 'between',
            insertText: '${1:column} BETWEEN ${2:start} AND ${3:end}',
            detail: 'BETWEEN … AND',
        },
        {
            label: 'w1',
            insertText: '1=1\n  AND ',
            detail: 'WHERE 1=1 scaffold',
        },
        {
            label: 'null',
            insertText: '${1:column} IS NULL',
            detail: 'IS NULL',
        },
    ],
    tail: [
        {label: 'ord', insertText: 'ORDER BY ${1:column} ${2|ASC,DESC|}', detail: 'ORDER BY'},
        {label: 'off', insertText: 'OFFSET ${1:0}', detail: 'OFFSET n'},
        {label: 'uni', insertText: 'UNION ALL\nSELECT ${1:*}\nFROM ${2:table}', detail: 'UNION ALL'},
    ],
    select_list: [
        {
            label: 'cnt',
            insertText: 'COUNT(*) AS ${1:total}',
            detail: 'COUNT(*) AS total',
        },
        {
            label: 'case',
            insertText: 'CASE WHEN ${1:condition} THEN ${2:value} ELSE ${3:NULL} END AS ${4:label}',
            detail: 'CASE expression',
        },
        {
            label: 'win',
            insertText:
                'ROW_NUMBER() OVER (PARTITION BY ${1:column} ORDER BY ${2:column}) AS ${3:rn}',
            detail: 'ROW_NUMBER window',
        },
    ],
    group_by: [
        {label: 'cnt', insertText: 'COUNT(*) AS ${1:cnt}', detail: 'COUNT(*)'},
    ],
}
