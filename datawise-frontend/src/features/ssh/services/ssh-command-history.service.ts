const STORAGE_PREFIX = 'ssh-command-history:'
const HISTORY_LIMIT = 12

function storageKey(connectionId: string): string {
    return `${STORAGE_PREFIX}${connectionId}`
}

export function readCommandHistory(connectionId: string): string[] {
    if (!connectionId) return []
    try {
        const raw = localStorage.getItem(storageKey(connectionId))
        if (!raw) return []
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) return []
        return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    } catch {
        return []
    }
}

export function pushCommandHistory(connectionId: string, command: string): string[] {
    if (!connectionId) return []
    const trimmed = command.trim()
    if (!trimmed) return readCommandHistory(connectionId)

    const next = [trimmed, ...readCommandHistory(connectionId).filter((item) => item !== trimmed)]
        .slice(0, HISTORY_LIMIT)

    try {
        localStorage.setItem(storageKey(connectionId), JSON.stringify(next))
    } catch {
        // ignore quota errors
    }
    return next
}

export function clearCommandHistory(connectionId: string): void {
    if (!connectionId) return
    try {
        localStorage.removeItem(storageKey(connectionId))
    } catch {
        // ignore
    }
}
