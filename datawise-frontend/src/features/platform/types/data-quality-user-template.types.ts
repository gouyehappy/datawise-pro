import type {DataQualityAssertionKind} from '@/features/platform/constants/data-quality-rule-templates'

/** User-saved data-quality rule template (local, per registered user). */
export interface DataQualityUserTemplate {
    id: string
    name: string
    description: string
    sql: string
    assertion: DataQualityAssertionKind
    expected: string
    column: string
    blocking: boolean
    cronExpression?: string
    createdAt: number
    updatedAt: number
}

export const DATA_QUALITY_USER_TEMPLATE_STORAGE_KEY = 'dw-cli-data-quality-templates'
export const DATA_QUALITY_USER_TEMPLATE_MAX = 40
export const DATA_QUALITY_USER_TEMPLATE_ID_PREFIX = 'dqtpl'
