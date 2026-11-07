import type {FederatedViewSource} from '@/features/platform/types/platform.types'
import type {ExtractedConnection} from '@/features/explorer/utils/tree-targets'

export type FederatedViewWizardStep = 'sources' | 'generate' | 'save'

export interface FederatedViewWizardSourceDraft {
    id: string
    alias: string
    connectionId: string
    connectionLabel: string
    database: string
}

export interface FederatedViewWizardForm {
    name: string
    description: string
    prompt: string
    sql: string
    sources: FederatedViewWizardSourceDraft[]
}

let draftIdCounter = 0

export function nextFederatedWizardSourceId(): string {
    draftIdCounter += 1
    return `fsource-${draftIdCounter}`
}

export function createDefaultFederatedWizardForm(
    initial?: Partial<Pick<FederatedViewWizardForm, 'name' | 'description' | 'prompt' | 'sql' | 'sources'>>,
): FederatedViewWizardForm {
    return {
        name: initial?.name ?? '',
        description: initial?.description ?? '',
        prompt: initial?.prompt ?? '',
        sql: initial?.sql ?? '',
        sources: initial?.sources ? [...initial.sources] : [],
    }
}

export function createFederatedWizardSourceDraft(input: {
    connectionId: string
    connectionLabel: string
    database: string
    alias?: string
    existingAliases?: string[]
}): FederatedViewWizardSourceDraft {
    const existing = input.existingAliases ?? []
    const alias = input.alias?.trim() || suggestFederatedAlias(input.database, existing)
    return {
        id: nextFederatedWizardSourceId(),
        alias,
        connectionId: input.connectionId,
        connectionLabel: input.connectionLabel,
        database: input.database,
    }
}

export function suggestFederatedAlias(database: string, existing: readonly string[]): string {
    const normalized = database
        .trim()
        .replace(/[^a-zA-Z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()
    const base = normalized || 'source'
    if (!existing.includes(base)) {
        return base
    }
    let index = 2
    while (existing.includes(`${base}${index}`)) {
        index += 1
    }
    return `${base}${index}`
}

export function reorderFederatedWizardSources(
    sources: FederatedViewWizardSourceDraft[],
    fromIndex: number,
    toIndex: number,
): FederatedViewWizardSourceDraft[] {
    if (
        fromIndex === toIndex
        || fromIndex < 0
        || toIndex < 0
        || fromIndex >= sources.length
        || toIndex >= sources.length
    ) {
        return sources
    }
    const next = [...sources]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    return next
}

export function buildInitialFederatedWizardSources(
    connections: ExtractedConnection[],
    tabConnectionId?: string,
    tabDatabase?: string,
): FederatedViewWizardSourceDraft[] {
    const connectionId = tabConnectionId?.trim()
    const database = tabDatabase?.trim()
    if (!connectionId || !database) {
        return []
    }
    const connection = connections.find((item) => item.id === connectionId)
    if (!connection) {
        return []
    }
    return [
        createFederatedWizardSourceDraft({
            connectionId,
            connectionLabel: connection.label,
            database,
            alias: 'primary',
        }),
    ]
}

export function validateFederatedWizardStep(
    step: FederatedViewWizardStep,
    form: FederatedViewWizardForm,
): string | null {
    switch (step) {
        case 'sources': {
            if (form.sources.length < 2) {
                return 'needTwoSources'
            }
            const aliases = new Set<string>()
            for (const source of form.sources) {
                if (!source.connectionId.trim() || !source.database.trim()) {
                    return 'sourceIncomplete'
                }
                const alias = source.alias.trim()
                if (!alias) {
                    return 'aliasRequired'
                }
                if (aliases.has(alias)) {
                    return 'aliasDuplicate'
                }
                aliases.add(alias)
            }
            return null
        }
        case 'generate':
            return form.sql.trim() ? null : 'sqlRequired'
        case 'save':
            return form.name.trim() ? null : 'nameRequired'
        default:
            return null
    }
}

export function canAccessFederatedWizardStep(
    step: FederatedViewWizardStep,
    form: FederatedViewWizardForm,
): boolean {
    const order: FederatedViewWizardStep[] = ['sources', 'generate', 'save']
    const targetIndex = order.indexOf(step)
    for (let i = 0; i < targetIndex; i += 1) {
        if (validateFederatedWizardStep(order[i], form) !== null) {
            return false
        }
    }
    return true
}

export function isFederatedWizardStepComplete(
    step: FederatedViewWizardStep,
    form: FederatedViewWizardForm,
): boolean {
    return validateFederatedWizardStep(step, form) === null
}

export function toFederatedViewSources(
    sources: FederatedViewWizardSourceDraft[],
): FederatedViewSource[] {
    return sources.map((source) => ({
        alias: source.alias.trim(),
        connectionId: source.connectionId.trim(),
        connectionLabel: source.connectionLabel.trim() || undefined,
        database: source.database.trim(),
    }))
}

export function formatFederatedSourceLabel(source: FederatedViewWizardSourceDraft): string {
    const conn = source.connectionLabel || source.connectionId
    return `${source.alias} · ${conn} / ${source.database}`
}
