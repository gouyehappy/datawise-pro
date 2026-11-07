import type {SqlValueKind} from './column-type'
import type {SqlColumnMeta} from '@sql-editor/types'
import {buildEnumInListLiteral, formatSqlEnumLiteral} from './enum-values'
import {columnEnumValues} from '@sql-editor/utils/schema-columns'

export type ValueTail = 'equals' | 'like' | 'in' | 'is' | 'between'

export type ValueItem = {
    label: string
    insertText: string
    detailKey: string
    snippet?: boolean
    kind?: 'value_string' | 'value_number' | 'value'
}

export function detectValueTail(segment: string): ValueTail | null {
    // trimEnd 后运算符尾随空格会消失，故「停在 =」与「= pai」分开匹配
    const tail = segment.trimEnd()
    if (/[\w$.)]\s*(=|<>|!=|>=|<=|<|>)\s*$/i.test(tail)) return 'equals'
    if (/[\w$.)]\s*(=|<>|!=|>=|<=|<|>)\s+[A-Za-z_][\w$]*$/i.test(tail)) return 'equals'
    if (/\b(?:NOT\s+)?(?:LIKE|ILIKE)\s*$/i.test(tail)) return 'like'
    if (/\b(?:NOT\s+)?(?:LIKE|ILIKE)\s+[A-Za-z_][\w$]*$/i.test(tail)) return 'like'
    if (/\b(?:NOT\s+)?IN\s*$/i.test(tail)) return 'in'
    if (/\b(?:NOT\s+)?IN\s*\(\s*$/i.test(tail)) return 'in'
    if (/\bIS\s+(?:NOT\s+)?$/i.test(tail)) return 'is'
    if (/\bIS\s+(?:NOT\s+)?[A-Za-z_][\w$]*$/i.test(tail) && !/\bIS\s+(?:NOT\s+)?NULL\b/i.test(tail)) {
        return 'is'
    }
    if (/\b(?:NOT\s+)?BETWEEN\s*$/i.test(tail)) return 'between'
    return null
}

function equalsTemporalTemplates(columnType?: string): ValueItem[] {
    const t = columnType?.toLowerCase().replace(/\s+/g, '') ?? ''
    if (/^time(?:\(|$)/.test(t) && !/datetime|timestamp/.test(t)) {
        return [
            {
                label: 'HH:MM:SS',
                insertText: "'${1:HH:MM:SS}'",
                detailKey: 'completion.value.date_literal',
                snippet: true,
                kind: 'value_string',
            },
        ]
    }
    if (/^year(?:\(|$)/.test(t)) {
        return [
            {
                label: '2024',
                insertText: '${1:2024}',
                detailKey: 'completion.value.numeric_template',
                snippet: true,
                kind: 'value_number',
            },
        ]
    }
    if (/datetime|timestamp/.test(t)) {
        return [
            {
                label: 'YYYY-MM-DD HH:MM:SS',
                insertText: "'${1:YYYY-MM-DD HH:MM:SS}'",
                detailKey: 'completion.value.date_literal',
                snippet: true,
                kind: 'value_string',
            },
            {
                label: 'CURRENT_TIMESTAMP',
                insertText: 'CURRENT_TIMESTAMP',
                detailKey: 'completion.value.current_timestamp',
                kind: 'value',
            },
        ]
    }
    return [
        {
            label: 'YYYY-MM-DD',
            insertText: "'${1:YYYY-MM-DD}'",
            detailKey: 'completion.value.date_literal',
            snippet: true,
            kind: 'value_string',
        },
        {
            label: 'CURRENT_DATE',
            insertText: 'CURRENT_DATE',
            detailKey: 'completion.value.current_date',
            kind: 'value',
        },
    ]
}

function equalsTypeTemplates(
    columnKind: SqlValueKind,
    columnType?: string,
    leftMeta?: Pick<SqlColumnMeta, 'nullable'>,
): ValueItem[] {
    const nullish: ValueItem[] =
        leftMeta?.nullable === true
            ? [
                  {label: 'NULL', insertText: 'NULL', detailKey: 'completion.value.null', kind: 'value'},
              ]
            : []

    switch (columnKind) {
        case 'numeric':
            return [
                ...nullish,
                {
                    label: '123',
                    insertText: '${1:0}',
                    detailKey: 'completion.value.numeric_template',
                    snippet: true,
                    kind: 'value_number',
                },
            ]
        case 'string':
            return [
                ...nullish,
                {
                    label: 'abc',
                    insertText: "'${1:value}'",
                    detailKey: 'completion.value.string_template',
                    snippet: true,
                    kind: 'value_string',
                },
                {
                    label: "''",
                    insertText: "''",
                    detailKey: 'completion.value.empty_string',
                    kind: 'value_string',
                },
            ]
        case 'boolean':
            return [
                ...nullish,
                {label: 'TRUE', insertText: 'TRUE', detailKey: 'completion.value.true', kind: 'value'},
                {label: 'FALSE', insertText: 'FALSE', detailKey: 'completion.value.false', kind: 'value'},
            ]
        case 'temporal':
            return [
                ...nullish,
                ...equalsTemporalTemplates(columnType),
                {
                    label: 'NOW()',
                    insertText: 'NOW()',
                    detailKey: 'completion.value.now',
                    kind: 'value',
                },
            ]
        case 'unknown':
        default:
            return [
                ...nullish,
                {
                    label: '123',
                    insertText: '${1:0}',
                    detailKey: 'completion.value.numeric_template',
                    snippet: true,
                    kind: 'value_number',
                },
                {
                    label: 'abc',
                    insertText: "'${1:value}'",
                    detailKey: 'completion.value.string_template',
                    snippet: true,
                    kind: 'value_string',
                },
            ]
    }
}

export function buildPredicateValueItems(
    tail: ValueTail,
    columnKind: SqlValueKind,
    enumValues: string[] = [],
    leftMeta?: Pick<SqlColumnMeta, 'type' | 'enumValues' | 'nullable'>,
    betweenLabel = 'start AND end',
): ValueItem[] {
    const items: ValueItem[] = []
    const meta = leftMeta as SqlColumnMeta | undefined

    const pushEnumValues = (forIn: boolean) => {
        if (!enumValues.length) return
        if (forIn) {
            const list = buildEnumInListLiteral(enumValues, meta)
            items.push({
                label: `(${list})`,
                insertText: `(${list})`,
                detailKey: 'completion.value.in_enum',
            })
        }
        for (const value of enumValues) {
            const literal = formatSqlEnumLiteral(value, meta)
            items.push({
                label: literal,
                insertText: literal,
                detailKey: 'completion.value.enum',
            })
        }
    }

    switch (tail) {
        case 'equals':
            pushEnumValues(false)
            items.push(...equalsTypeTemplates(columnKind, leftMeta?.type, leftMeta))
            break
        case 'like':
            if (columnKind !== 'numeric' && columnKind !== 'boolean') {
                items.push(
                    {
                        label: "'%…%'",
                        insertText: "'${1:%value%}'",
                        detailKey: 'completion.value.like_pattern',
                        snippet: true,
                        kind: 'value_string',
                    },
                    {
                        label: "'…%'",
                        insertText: "'${1:value}%'",
                        detailKey: 'completion.value.like_prefix',
                        snippet: true,
                        kind: 'value_string',
                    },
                )
            }
            break
        case 'in':
            pushEnumValues(true)
            if (columnKind === 'numeric') {
                items.push({
                    label: '(1, 2)',
                    insertText: '(${1:1}, ${2:2})',
                    detailKey: 'completion.value.in_list',
                    snippet: true,
                })
            } else if (columnKind === 'temporal') {
                items.push({
                    label: "('YYYY-MM-DD')",
                    insertText: "('${1:YYYY-MM-DD}')",
                    detailKey: 'completion.value.in_list',
                    snippet: true,
                })
            } else {
                items.push({
                    label: '(v1, v2)',
                    insertText: '(${1:value1}, ${2:value2})',
                    detailKey: 'completion.value.in_list',
                    snippet: true,
                })
            }
            items.push({
                label: '(SELECT …)',
                insertText: '(SELECT ${1:1})',
                detailKey: 'completion.value.subquery',
                snippet: true,
            })
            break
        case 'is':
            items.push(
                {label: 'NULL', insertText: 'NULL', detailKey: 'completion.value.null'},
                {label: 'NOT NULL', insertText: 'NOT NULL', detailKey: 'completion.value.not_null'},
            )
            if (columnKind === 'boolean') {
                items.push(
                    {label: 'TRUE', insertText: 'TRUE', detailKey: 'completion.value.true'},
                    {label: 'FALSE', insertText: 'FALSE', detailKey: 'completion.value.false'},
                )
            }
            break
        case 'between':
            if (columnKind === 'temporal') {
                items.push({
                    label: betweenLabel,
                    insertText: "'${1:YYYY-MM-DD}' AND '${2:YYYY-MM-DD}'",
                    detailKey: 'completion.value.between_range',
                    snippet: true,
                })
            } else if (columnKind === 'numeric') {
                items.push({
                    label: betweenLabel,
                    insertText: '${1:0} AND ${2:100}',
                    detailKey: 'completion.value.between_range',
                    snippet: true,
                })
            } else {
                items.push({
                    label: betweenLabel,
                    insertText: '${1:start} AND ${2:end}',
                    detailKey: 'completion.value.between_range',
                    snippet: true,
                })
            }
            break
    }

    return items
}

/** 从列元数据解析枚举值列表 */
export function predicateColumnEnumValues(meta?: Pick<SqlColumnMeta, 'enumValues'>): string[] {
    return columnEnumValues(meta as SqlColumnMeta | undefined)
}
