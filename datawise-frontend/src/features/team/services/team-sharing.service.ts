/** 解析逗号/换行分隔的 ID 列表（团队共享配置用） */
export function parseDelimitedIds(value: string): string[] {
    return value
        .split(/[,，;\n\r]+/)
        .map((item) => item.trim())
        .filter(Boolean)
}

export type ShareableConnectionOption = {
    id: string
    label: string
}

/** Toggle a connection id in the shared list; returns a new array. */
export function toggleSharedConnectionId(
    currentIds: readonly string[],
    connectionId: string,
): string[] {
    const id = connectionId.trim()
    if (!id) return [...currentIds]
    const set = new Set(currentIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    return [...set]
}

/**
 * Merge explorer-visible connections with already-shared ids (so co-admin
 * shares remain visible even if not in the local tree).
 */
export function buildShareableConnectionOptions(
    explorerConnections: readonly ShareableConnectionOption[],
    sharedIds: readonly string[],
): ShareableConnectionOption[] {
    const byId = new Map<string, ShareableConnectionOption>()
    for (const item of explorerConnections) {
        if (!item.id?.trim()) continue
        byId.set(item.id, {id: item.id, label: item.label?.trim() || item.id})
    }
    for (const id of sharedIds) {
        const trimmed = id?.trim()
        if (!trimmed || byId.has(trimmed)) continue
        byId.set(trimmed, {id: trimmed, label: trimmed})
    }
    return [...byId.values()].sort((a, b) =>
        a.label.localeCompare(b.label, undefined, {sensitivity: 'base'}),
    )
}
