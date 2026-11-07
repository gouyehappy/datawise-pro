import {
    FeaturePermission,
    type FeaturePermissionKey,
} from '@/features/auth/types/feature-permission.types'
import {createPreset} from '@/features/auth/services/feature-permission.service'

export interface FeaturePermissionAuditIssue {
    kind: 'missing-in-backend' | 'missing-in-frontend' | 'workbench-preset-mismatch'
    key: string
    detail?: string
}

export interface BackendPermissionSnapshot {
    all: Set<string>
    workbenchGranted: Set<string>
}

const FRONTEND_ALL_KEYS = Object.values(FeaturePermission) as FeaturePermissionKey[]

function parseBackendConstantMap(source: string): Map<string, string> {
    const map = new Map<string, string>()
    const pattern = /public\s+static\s+final\s+String\s+(\w+)\s*=\s*"([^"]+)";/g
    for (const match of source.matchAll(pattern)) {
        map.set(match[1]!, match[2]!)
    }
    return map
}

function resolveConstant(name: string, constants: Map<string, string>): string | null {
    return constants.get(name) ?? null
}

export function parseBackendPermissionSnapshot(source: string): BackendPermissionSnapshot {
    const constants = parseBackendConstantMap(source)

    const all = new Set<string>()
    const allMatch = source.match(/public\s+static\s+final\s+Set<String>\s+ALL\s*=\s*Set\.of\(([\s\S]*?)\);/)
    if (allMatch?.[1]) {
        for (const token of allMatch[1].match(/\b[A-Z0-9_]+\b/g) ?? []) {
            const value = resolveConstant(token, constants)
            if (value) all.add(value)
        }
    }

    const workbenchGranted = new Set<string>()
    const workbenchMatch = source.match(/workbenchPreset\(\)\s*\{([\s\S]*?)\n\s*\}/)
    if (workbenchMatch?.[1]) {
        for (const match of workbenchMatch[1].matchAll(/preset\.put\((\w+),\s*true\)/g)) {
            const value = resolveConstant(match[1]!, constants)
            if (value) workbenchGranted.add(value)
        }
    }

    return {all, workbenchGranted}
}

export function auditFeaturePermissionSync(backendSource: string): FeaturePermissionAuditIssue[] {
    const backend = parseBackendPermissionSnapshot(backendSource)
    const frontendAll = new Set(FRONTEND_ALL_KEYS)
    const issues: FeaturePermissionAuditIssue[] = []

    for (const key of frontendAll) {
        if (!backend.all.has(key)) {
            issues.push({kind: 'missing-in-backend', key})
        }
    }
    for (const key of backend.all) {
        if (!frontendAll.has(key as FeaturePermissionKey)) {
            issues.push({kind: 'missing-in-frontend', key})
        }
    }

    const frontendWorkbenchGranted = new Set(
        FRONTEND_ALL_KEYS.filter((key) => createPreset('workbench')[key]),
    )
    for (const key of frontendWorkbenchGranted) {
        if (!backend.workbenchGranted.has(key)) {
            issues.push({
                kind: 'workbench-preset-mismatch',
                key,
                detail: 'granted in frontend workbench preset but not backend',
            })
        }
    }
    for (const key of backend.workbenchGranted) {
        if (!frontendWorkbenchGranted.has(key as FeaturePermissionKey)) {
            issues.push({
                kind: 'workbench-preset-mismatch',
                key,
                detail: 'granted in backend workbench preset but not frontend',
            })
        }
    }

    return issues
}
