import type {DataQualitySharedTemplate} from '@/features/platform/types/platform.types'

const ASSERTION_I18N_PREFIX = 'workspace.platformCatalog.form.dqAssertion.'

/** Human-readable assertion summary for catalog / management lists. */
export function formatDataQualitySharedTemplateSummary(
    template: Pick<DataQualitySharedTemplate, 'assertion' | 'expected' | 'column'>,
    translate: (key: string) => string,
): string {
    const assertion = template.assertion?.trim() || 'empty_result'
    const label = translate(`${ASSERTION_I18N_PREFIX}${assertion}`)
    if (assertion === 'empty_result') {
        return label
    }
    const expected = template.expected?.trim() || '0'
    const column = template.column?.trim()
    if (column) {
        return `${column} · ${label} ${expected}`
    }
    return `${label} ${expected}`
}
