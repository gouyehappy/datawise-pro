import {createId} from '@/core/utils/id'
import type {
    DataQualityAssertionKind,
    DataQualityRuleFormPrefill,
} from '@/features/platform/constants/data-quality-rule-templates'
import {
    DATA_QUALITY_USER_TEMPLATE_ID_PREFIX,
    DATA_QUALITY_USER_TEMPLATE_MAX,
    DATA_QUALITY_USER_TEMPLATE_STORAGE_KEY,
    type DataQualityUserTemplate,
} from '@/features/platform/types/data-quality-user-template.types'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {
    canPersistLocalResource,
    canReadResource,
    resolveResourceStorageKey,
} from '@/features/auth/services/user-resource-policy'

const ASSERTIONS = new Set<DataQualityAssertionKind>([
    'empty_result',
    'row_count_eq',
    'row_count_lte',
    'scalar_eq',
    'scalar_lte',
])

function resolveStorageKey(): string {
    return resolveResourceStorageKey(UserResource.DataQualityTemplates, DATA_QUALITY_USER_TEMPLATE_STORAGE_KEY)
        ?? DATA_QUALITY_USER_TEMPLATE_STORAGE_KEY
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeAssertion(value: unknown): DataQualityAssertionKind {
    if (typeof value === 'string' && ASSERTIONS.has(value as DataQualityAssertionKind)) {
        return value as DataQualityAssertionKind
    }
    return 'empty_result'
}

function normalizeTemplate(raw: unknown): DataQualityUserTemplate | null {
    if (!isRecord(raw)) return null
    const sql = typeof raw.sql === 'string' ? raw.sql.trim() : ''
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (!sql || !name) return null
    const id = typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : createId(DATA_QUALITY_USER_TEMPLATE_ID_PREFIX)
    const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
    const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt
    const cron = typeof raw.cronExpression === 'string' ? raw.cronExpression.trim() : ''
    return {
        id,
        name,
        description: typeof raw.description === 'string' ? raw.description.trim() : '',
        sql,
        assertion: normalizeAssertion(raw.assertion),
        expected: typeof raw.expected === 'string' ? raw.expected.trim() : '0',
        column: typeof raw.column === 'string' ? raw.column.trim() : '',
        blocking: Boolean(raw.blocking),
        ...(cron ? {cronExpression: cron} : {}),
        createdAt,
        updatedAt,
    }
}

export function readDataQualityUserTemplates(storage: Storage = localStorage): DataQualityUserTemplate[] {
    if (!canReadResource(UserResource.DataQualityTemplates)) return []
    if (!canPersistLocalResource(UserResource.DataQualityTemplates)) return []
    try {
        const raw = storage.getItem(resolveStorageKey())
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed
            .map(normalizeTemplate)
            .filter((item): item is DataQualityUserTemplate => item !== null)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, DATA_QUALITY_USER_TEMPLATE_MAX)
    } catch {
        return []
    }
}

export function writeDataQualityUserTemplates(
    templates: DataQualityUserTemplate[],
    storage: Storage = localStorage,
): boolean {
    if (!canPersistLocalResource(UserResource.DataQualityTemplates)) return true
    try {
        const payload = [...templates]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, DATA_QUALITY_USER_TEMPLATE_MAX)
        storage.setItem(resolveStorageKey(), JSON.stringify(payload))
        return true
    } catch {
        return false
    }
}

export function createDataQualityUserTemplate(input: {
    name: string
    description?: string
    sql: string
    assertion: DataQualityAssertionKind
    expected?: string
    column?: string
    blocking?: boolean
    cronExpression?: string
}): DataQualityUserTemplate | null {
    const name = input.name.trim()
    const sql = input.sql.trim()
    if (!name || !sql) return null
    const now = Date.now()
    const cron = input.cronExpression?.trim() ?? ''
    return {
        id: createId(DATA_QUALITY_USER_TEMPLATE_ID_PREFIX),
        name,
        description: input.description?.trim() ?? '',
        sql,
        assertion: normalizeAssertion(input.assertion),
        expected: input.expected?.trim() || '0',
        column: input.column?.trim() ?? '',
        blocking: Boolean(input.blocking),
        ...(cron ? {cronExpression: cron} : {}),
        createdAt: now,
        updatedAt: now,
    }
}

export function upsertDataQualityUserTemplate(
    templates: DataQualityUserTemplate[],
    template: DataQualityUserTemplate,
): DataQualityUserTemplate[] {
    const next = templates.filter((item) => item.id !== template.id)
    next.unshift({...template, updatedAt: Date.now()})
    return next.slice(0, DATA_QUALITY_USER_TEMPLATE_MAX)
}

export function removeDataQualityUserTemplate(
    templates: DataQualityUserTemplate[],
    templateId: string,
): DataQualityUserTemplate[] {
    return templates.filter((item) => item.id !== templateId)
}

export function findDataQualityUserTemplate(
    id: string,
    templates: readonly DataQualityUserTemplate[],
): DataQualityUserTemplate | null {
    const trimmed = id.trim()
    if (!trimmed) return null
    return templates.find((item) => item.id === trimmed) ?? null
}

export function applyDataQualityUserTemplate(template: DataQualityUserTemplate): DataQualityRuleFormPrefill {
    return {
        name: template.name,
        sql: template.sql,
        dqAssertion: template.assertion,
        dqExpected: template.expected || '0',
        dqColumn: template.column || '',
        dqBlocking: template.blocking,
        ...(template.cronExpression != null ? {cronExpression: template.cronExpression} : {}),
    }
}
