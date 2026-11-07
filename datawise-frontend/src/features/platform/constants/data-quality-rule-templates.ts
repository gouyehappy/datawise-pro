/** Built-in data-quality rule templates (prefill Add form; no backend). */

export type DataQualityAssertionKind =
    | 'empty_result'
    | 'row_count_eq'
    | 'row_count_lte'
    | 'scalar_eq'
    | 'scalar_lte'

export interface DataQualityRuleTemplate {
    id: string
    /** i18n key under workspace.platformCatalog.form.dqTemplate.items.* */
    nameKey: string
    descriptionKey: string
    sql: string
    assertion: DataQualityAssertionKind
    expected?: string
    column?: string
    blocking?: boolean
    /** When set, overwrite cron (catalog default is blank / gate-only). */
    cronExpression?: string
}

/** Sentinel for “custom / blank” in the template select. */
export const DATA_QUALITY_RULE_TEMPLATE_CUSTOM_ID = '__custom__'

export const DATA_QUALITY_RULE_TEMPLATES: readonly DataQualityRuleTemplate[] = [
    {
        id: 'no_violations',
        nameKey: 'no_violations',
        descriptionKey: 'no_violationsDesc',
        sql: 'SELECT *\nFROM {table}\nWHERE /* violation predicate */ 1 = 0',
        assertion: 'empty_result',
        blocking: true,
    },
    {
        id: 'no_duplicates',
        nameKey: 'no_duplicates',
        descriptionKey: 'no_duplicatesDesc',
        sql: 'SELECT {column}, COUNT(*) AS cnt\nFROM {table}\nGROUP BY {column}\nHAVING COUNT(*) > 1',
        assertion: 'empty_result',
        blocking: true,
    },
    {
        id: 'no_nulls',
        nameKey: 'no_nulls',
        descriptionKey: 'no_nullsDesc',
        sql: 'SELECT {column}\nFROM {table}\nWHERE {column} IS NULL',
        assertion: 'empty_result',
        blocking: true,
    },
    {
        id: 'max_violation_rows',
        nameKey: 'max_violation_rows',
        descriptionKey: 'max_violation_rowsDesc',
        sql: 'SELECT 1\nFROM {table}\nWHERE /* violation predicate */ 1 = 1',
        assertion: 'row_count_lte',
        expected: '0',
        blocking: true,
    },
    {
        id: 'failed_count_threshold',
        nameKey: 'failed_count_threshold',
        descriptionKey: 'failed_count_thresholdDesc',
        sql: "SELECT COUNT(*) AS cnt\nFROM {table}\nWHERE status = 'failed'",
        assertion: 'scalar_lte',
        expected: '100',
        column: 'cnt',
        blocking: false,
    },
] as const

export function findDataQualityRuleTemplate(id: string): DataQualityRuleTemplate | null {
    const trimmed = id.trim()
    if (!trimmed || trimmed === DATA_QUALITY_RULE_TEMPLATE_CUSTOM_ID) return null
    return DATA_QUALITY_RULE_TEMPLATES.find((item) => item.id === trimmed) ?? null
}

export interface DataQualityRuleFormPrefill {
    name: string
    sql: string
    dqAssertion: DataQualityAssertionKind
    dqExpected: string
    dqColumn: string
    dqBlocking: boolean
    cronExpression?: string
}

/** Map a template into form field values (caller localizes the display name). */
export function applyDataQualityRuleTemplate(
    template: DataQualityRuleTemplate,
    localizeName: (nameKey: string) => string,
): DataQualityRuleFormPrefill {
    return {
        name: localizeName(template.nameKey),
        sql: template.sql,
        dqAssertion: template.assertion,
        dqExpected: template.expected ?? '0',
        dqColumn: template.column ?? '',
        dqBlocking: template.blocking ?? false,
        ...(template.cronExpression != null ? {cronExpression: template.cronExpression} : {}),
    }
}
