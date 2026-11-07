import type {TableMigrationWizardForm} from '@/features/explorer/services/table-migration.pure'

/** Marker recognized by backend approve-and-execute to skip SQL execution. */
export const DATA_MIGRATION_APPROVAL_MARKER = 'DATAWISE_APPROVAL_KIND:DATA_MIGRATION'

export function isDataMigrationApprovalSql(sql: string | null | undefined): boolean {
    return Boolean(sql?.includes(DATA_MIGRATION_APPROVAL_MARKER))
}

export function buildDataMigrationApprovalSql(input: {
    sourceConnectionLabel: string
    sourceDatabase: string
    targetConnectionLabel: string
    targetDatabase: string
    form: Pick<
        TableMigrationWizardForm,
        | 'mode'
        | 'conflictStrategy'
        | 'truncateTarget'
        | 'watermarkColumn'
        | 'whereClause'
        | 'batchSize'
        | 'targetMissingPolicy'
    >
    tables: string[]
}): string {
    const tables = input.tables.length ? input.tables : ['(none)']
    const conflict =
        input.form.mode === 'PK_UPSERT'
            ? (input.form.conflictStrategy ?? 'OVERWRITE')
            : 'n/a'
    const lines = [
        `/* ${DATA_MIGRATION_APPROVAL_MARKER} */`,
        '-- DataWise data migration plan (review only).',
        '-- Approving records consent; a team manager runs the migration from the wizard.',
        `-- Source: ${input.sourceConnectionLabel} / ${input.sourceDatabase}`,
        `-- Target: ${input.targetConnectionLabel} / ${input.targetDatabase}`,
        `-- Mode: ${input.form.mode}`,
        `-- Conflict strategy: ${conflict}`,
        `-- Truncate target: ${input.form.truncateTarget ? 'yes' : 'no'}`,
        `-- Target missing policy: ${input.form.targetMissingPolicy}`,
        `-- Watermark: ${input.form.watermarkColumn.trim() || '(none)'}`,
        `-- WHERE: ${input.form.whereClause.trim() || '(none)'}`,
        `-- Batch size: ${input.form.batchSize}`,
        '-- Tables:',
        ...tables.map((name) => `--   - ${name}`),
        'INSERT INTO __datawise_data_migration_plan__(note) VALUES (\'review-only\');',
    ]
    return lines.join('\n')
}
