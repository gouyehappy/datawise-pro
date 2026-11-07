import {
    GRID_VIEW_STATE_STORAGE_KEY,
    createEmptyGridViewState,
    normalizeGridViewState,
    type GridViewState,
} from '@/features/workspace/data-grid/services/grid-view-state.service'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {
    canPersistLocalResource,
    canReadResource,
    resolveResourceStorageKey,
} from '@/features/auth/services/user-resource-policy'

const MAX_SCOPES = 120

function resolveStorageKey(): string {
    return resolveResourceStorageKey(UserResource.GridViewState, GRID_VIEW_STATE_STORAGE_KEY)
        ?? GRID_VIEW_STATE_STORAGE_KEY
}

function readStore(): Record<string, GridViewState> {
    if (!canReadResource(UserResource.GridViewState)) return {}
    if (!canPersistLocalResource(UserResource.GridViewState)) return {}
    try {
        const raw = localStorage.getItem(resolveStorageKey())
        if (!raw) return {}
        const parsed = JSON.parse(raw) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
        const store: Record<string, GridViewState> = {}
        for (const [scope, value] of Object.entries(parsed)) {
            store[scope] = normalizeGridViewState(value)
        }
        return store
    } catch {
        return {}
    }
}

function writeStore(store: Record<string, GridViewState>) {
    if (!canPersistLocalResource(UserResource.GridViewState)) return
    try {
        localStorage.setItem(resolveStorageKey(), JSON.stringify(store))
    } catch {
        // ignore quota errors
    }
}

function trimStore(store: Record<string, GridViewState>): Record<string, GridViewState> {
    const entries = Object.entries(store)
    if (entries.length <= MAX_SCOPES) return store
    return Object.fromEntries(entries.slice(entries.length - MAX_SCOPES))
}

export function readGridViewState(scope: string): GridViewState {
    if (!scope.trim()) return createEmptyGridViewState()
    return readStore()[scope] ?? createEmptyGridViewState()
}

export function persistGridViewState(scope: string, state: GridViewState) {
    if (!scope.trim()) return
    const store = readStore()
    store[scope] = normalizeGridViewState(state)
    writeStore(trimStore(store))
}

export function removeGridViewState(scope: string) {
    if (!scope.trim()) return
    const store = readStore()
    if (!(scope in store)) return
    delete store[scope]
    writeStore(store)
}

/** @internal test helper */
export function clearAllGridViewStates() {
    localStorage.removeItem(resolveStorageKey())
}
