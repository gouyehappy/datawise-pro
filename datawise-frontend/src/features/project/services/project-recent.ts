/** 最近打开的项目 ID 列表（仅本地；移除不等于删除项目）。 */
const LS_RECENT = 'dw-cli-recent-project-ids'
const MAX_RECENT = 12

function readIds(): string[] {
    if (typeof localStorage === 'undefined') return []
    try {
        const raw = localStorage.getItem(LS_RECENT)
        if (!raw) return []
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) return []
        return parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    } catch {
        return []
    }
}

function writeIds(ids: string[]): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(LS_RECENT, JSON.stringify(ids.slice(0, MAX_RECENT)))
}

export function listRecentProjectIds(): string[] {
    return readIds()
}

export function touchRecentProject(projectId: string): void {
    const id = projectId?.trim()
    if (!id) return
    const next = [id, ...readIds().filter((x) => x !== id)]
    writeIds(next)
}

export function removeRecentProject(projectId: string): string[] {
    const next = readIds().filter((id) => id !== projectId)
    writeIds(next)
    return next
}
