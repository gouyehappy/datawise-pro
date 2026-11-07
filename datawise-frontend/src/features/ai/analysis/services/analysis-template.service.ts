import {createId} from '@/core/utils/id'
import type {AiAnalysisMode} from '@/features/ai/types/analysis'
import {
    AI_ANALYSIS_TEMPLATE_MAX,
    AI_ANALYSIS_TEMPLATE_STORAGE_KEY,
    type AiAnalysisTemplate,
} from '@/features/ai/analysis/types/analysis-template.types'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {
    canPersistLocalResource,
    canReadResource,
    resolveResourceStorageKey,
} from '@/features/auth/services/user-resource-policy'

function resolveAnalysisTemplateStorageKey(): string {
    return resolveResourceStorageKey(UserResource.AiAnalysisTemplates, AI_ANALYSIS_TEMPLATE_STORAGE_KEY)
        ?? AI_ANALYSIS_TEMPLATE_STORAGE_KEY
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeMode(value: unknown): AiAnalysisMode {
    if (value === 'quick' || value === 'smart' || value === 'custom') return value
    return 'smart'
}

function normalizeTemplate(raw: unknown): AiAnalysisTemplate | null {
    if (!isRecord(raw)) return null
    const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : ''
    if (!prompt) return null
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id : createId('tpl')
    const name =
        typeof raw.name === 'string' && raw.name.trim()
            ? raw.name.trim()
            : buildTemplateName(prompt)
    const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
    const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt
    const targetIds = Array.isArray(raw.targetIds)
        ? [...new Set(raw.targetIds.filter((item): item is string => typeof item === 'string'))]
        : []
    return {
        id,
        name,
        prompt,
        targetIds,
        analysisMode: normalizeMode(raw.analysisMode),
        createdAt,
        updatedAt,
    }
}

export function buildTemplateName(prompt: string, maxLen = 28): string {
    const compact = prompt.replace(/\s+/g, ' ').trim()
    if (!compact) return 'Untitled'
    return compact.length <= maxLen ? compact : `${compact.slice(0, maxLen).trim()}…`
}

export function readAnalysisTemplates(storage: Storage = localStorage): AiAnalysisTemplate[] {
    if (!canReadResource(UserResource.AiAnalysisTemplates)) return []
    if (!canPersistLocalResource(UserResource.AiAnalysisTemplates)) return []
    try {
        const raw = storage.getItem(resolveAnalysisTemplateStorageKey())
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed
            .map(normalizeTemplate)
            .filter((item): item is AiAnalysisTemplate => item !== null)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, AI_ANALYSIS_TEMPLATE_MAX)
    } catch {
        return []
    }
}

export function writeAnalysisTemplates(
    templates: AiAnalysisTemplate[],
    storage: Storage = localStorage,
): boolean {
    if (!canPersistLocalResource(UserResource.AiAnalysisTemplates)) return true
    try {
        const payload = [...templates]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, AI_ANALYSIS_TEMPLATE_MAX)
        storage.setItem(resolveAnalysisTemplateStorageKey(), JSON.stringify(payload))
        return true
    } catch {
        return false
    }
}

export function createAnalysisTemplate(input: {
    prompt: string
    name?: string
    targetIds?: string[]
    analysisMode?: AiAnalysisMode
}): AiAnalysisTemplate {
    const prompt = input.prompt.trim()
    const now = Date.now()
    return {
        id: createId('tpl'),
        name: input.name?.trim() || buildTemplateName(prompt),
        prompt,
        targetIds: [...new Set(input.targetIds ?? [])],
        analysisMode: input.analysisMode ?? 'smart',
        createdAt: now,
        updatedAt: now,
    }
}

export function upsertAnalysisTemplate(
    templates: AiAnalysisTemplate[],
    template: AiAnalysisTemplate,
): AiAnalysisTemplate[] {
    const next = templates.filter((item) => item.id !== template.id)
    next.unshift(template)
    return next.slice(0, AI_ANALYSIS_TEMPLATE_MAX)
}

export function removeAnalysisTemplate(
    templates: AiAnalysisTemplate[],
    templateId: string,
): AiAnalysisTemplate[] {
    return templates.filter((item) => item.id !== templateId)
}
