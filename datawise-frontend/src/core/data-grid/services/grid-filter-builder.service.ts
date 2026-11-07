/**
 * Visual WHERE filter-builder: structured rules ↔ SQL fragment for the clause bar.
 */

export type FilterBuilderOperator =
    | 'eq'
    | 'ne'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'startsWith'
    | 'endsWith'
    | 'isNull'
    | 'isNotNull'
    | 'in'

export type FilterBuilderRule = {
    id: string
    column: string
    operator: FilterBuilderOperator
    value: string
    /** Join with previous complete rule; ignored for the first active rule. */
    conjunction: 'AND' | 'OR'
}

export type FilterBuilderOperatorOption = {
    value: FilterBuilderOperator
    needsValue: boolean
}

export const FILTER_BUILDER_OPERATORS: FilterBuilderOperatorOption[] = [
    {value: 'eq', needsValue: true},
    {value: 'ne', needsValue: true},
    {value: 'gt', needsValue: true},
    {value: 'gte', needsValue: true},
    {value: 'lt', needsValue: true},
    {value: 'lte', needsValue: true},
    {value: 'contains', needsValue: true},
    {value: 'startsWith', needsValue: true},
    {value: 'endsWith', needsValue: true},
    {value: 'in', needsValue: true},
    {value: 'isNull', needsValue: false},
    {value: 'isNotNull', needsValue: false},
]

let ruleSeq = 0

export function createFilterBuilderRule(
    patch?: Partial<Omit<FilterBuilderRule, 'id'>>,
): FilterBuilderRule {
    ruleSeq += 1
    return {
        id: `fr-${Date.now().toString(36)}-${ruleSeq}`,
        column: '',
        operator: 'eq',
        value: '',
        conjunction: 'AND',
        ...patch,
    }
}

export function operatorNeedsValue(operator: FilterBuilderOperator): boolean {
    return FILTER_BUILDER_OPERATORS.find((item) => item.value === operator)?.needsValue ?? true
}

export function isFilterBuilderRuleComplete(rule: FilterBuilderRule): boolean {
    if (!rule.column.trim()) return false
    if (!operatorNeedsValue(rule.operator)) return true
    return rule.value.trim().length > 0
}

export function countActiveFilterBuilderRules(rules: readonly FilterBuilderRule[]): number {
    return rules.filter((rule) => isFilterBuilderRuleComplete(rule)).length
}

/** Quote identifier when it is not a plain SQL id. */
export function quoteFilterIdentifier(name: string): string {
    const trimmed = name.trim()
    if (!trimmed) return trimmed
    if (/^[A-Za-z_][\w$]*$/.test(trimmed)) return trimmed
    return `\`${trimmed.replace(/`/g, '``')}\``
}

/** Format a scalar for WHERE: numbers / bool / NULL stay bare; else string literal. */
export function formatFilterLiteral(raw: string): string {
    const text = raw.trim()
    if (!text) return "''"
    if (/^(null)$/i.test(text)) return 'NULL'
    if (/^(true|false)$/i.test(text)) return text.toUpperCase()
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return text
    return `'${text.replace(/'/g, "''")}'`
}

function likePattern(value: string, mode: 'contains' | 'startsWith' | 'endsWith'): string {
    // Client LIKE matcher has no escape char; neutralize % / _ in user text.
    const escaped = value.replace(/'/g, "''").replace(/[%_]/g, '')
    if (mode === 'contains') return `'%${escaped}%'`
    if (mode === 'startsWith') return `'${escaped}%'`
    return `'%${escaped}'`
}

export function buildFilterCondition(rule: FilterBuilderRule): string | null {
    if (!isFilterBuilderRuleComplete(rule)) return null
    const col = quoteFilterIdentifier(rule.column)
    switch (rule.operator) {
        case 'eq':
            return `${col} = ${formatFilterLiteral(rule.value)}`
        case 'ne':
            return `${col} <> ${formatFilterLiteral(rule.value)}`
        case 'gt':
            return `${col} > ${formatFilterLiteral(rule.value)}`
        case 'gte':
            return `${col} >= ${formatFilterLiteral(rule.value)}`
        case 'lt':
            return `${col} < ${formatFilterLiteral(rule.value)}`
        case 'lte':
            return `${col} <= ${formatFilterLiteral(rule.value)}`
        case 'contains':
            return `${col} LIKE ${likePattern(rule.value.trim(), 'contains')}`
        case 'startsWith':
            return `${col} LIKE ${likePattern(rule.value.trim(), 'startsWith')}`
        case 'endsWith':
            return `${col} LIKE ${likePattern(rule.value.trim(), 'endsWith')}`
        case 'isNull':
            return `${col} IS NULL`
        case 'isNotNull':
            return `${col} IS NOT NULL`
        case 'in': {
            const parts = rule.value
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean)
            if (!parts.length) return null
            return `${col} IN (${parts.map(formatFilterLiteral).join(', ')})`
        }
        default:
            return null
    }
}

/** Join complete rules with AND/OR into a WHERE fragment. */
export function buildWhereFromFilterRules(rules: readonly FilterBuilderRule[]): string {
    const parts: Array<{rule: FilterBuilderRule; condition: string}> = []
    for (const rule of rules) {
        const condition = buildFilterCondition(rule)
        if (condition) parts.push({rule, condition})
    }
    if (!parts.length) return ''
    let result = parts[0]!.condition
    for (let i = 1; i < parts.length; i++) {
        const item = parts[i]!
        result = `(${result}) ${item.rule.conjunction} (${item.condition})`
    }
    return result
}
