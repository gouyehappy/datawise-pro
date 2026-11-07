const STORAGE_PREFIX = 'ssh-quick-ops-pins:'

export function readPinnedScriptRecordIds(connectionId: string): string[] {
    if (!connectionId) return []
    try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${connectionId}`)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
    } catch {
        return []
    }
}

export function writePinnedScriptRecordIds(connectionId: string, ids: string[]): void {
    if (!connectionId) return
    localStorage.setItem(`${STORAGE_PREFIX}${connectionId}`, JSON.stringify(ids))
}

export function togglePinnedScriptRecordId(connectionId: string, recordId: string): string[] {
    const current = readPinnedScriptRecordIds(connectionId)
    const next = current.includes(recordId)
        ? current.filter((id) => id !== recordId)
        : [...current, recordId]
    writePinnedScriptRecordIds(connectionId, next)
    return next
}
