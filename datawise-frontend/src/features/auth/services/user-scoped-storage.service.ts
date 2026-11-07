import type {UserResourceType} from '@/features/auth/types/user-resource.types'
import {
    canPersistLocalResource,
    canReadResource,
    resolveResourceStorageKey,
} from '@/features/auth/services/user-resource-policy'

export function readUserResourceJson<T>(
    resource: UserResourceType,
    baseKey: string,
    normalize: (raw: unknown) => T | null,
    storage: Storage = localStorage,
): T | null {
    if (!canReadResource(resource)) return null
    if (!canPersistLocalResource(resource) && !isGuestReadableLocal(resource)) {
        return null
    }
    const key = resolveResourceStorageKey(resource, baseKey)
    if (!key) return null
    try {
        const raw = storage.getItem(key)
        if (!raw) return null
        return normalize(JSON.parse(raw))
    } catch {
        return null
    }
}

export function writeUserResourceJson(
    resource: UserResourceType,
    baseKey: string,
    value: unknown,
    storage: Storage = localStorage,
): boolean {
    if (!canPersistLocalResource(resource)) return true
    const key = resolveResourceStorageKey(resource, baseKey)
    if (!key) return false
    try {
        storage.setItem(key, JSON.stringify(value))
        return true
    } catch {
        return false
    }
}

function isGuestReadableLocal(resource: UserResourceType): boolean {
    return canReadResource(resource)
}
