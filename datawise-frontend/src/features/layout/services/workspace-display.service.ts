export interface WorkspaceAccent {
    bg: string
    fg: string
}

const WORKSPACE_ACCENTS: WorkspaceAccent[] = [
    {bg: '#4f46e5', fg: '#ffffff'},
    {bg: '#7c3aed', fg: '#ffffff'},
    {bg: '#0891b2', fg: '#ffffff'},
    {bg: '#059669', fg: '#ffffff'},
    {bg: '#d97706', fg: '#1f2937'},
    {bg: '#e11d48', fg: '#ffffff'},
    {bg: '#2563eb', fg: '#ffffff'},
    {bg: '#0d9488', fg: '#ffffff'},
]

function hashPath(path: string): number {
    let hash = 0
    for (let i = 0; i < path.length; i += 1) {
        hash = ((hash << 5) - hash + path.charCodeAt(i)) | 0
    }
    return Math.abs(hash)
}

export function resolveWorkspaceAccent(path: string): WorkspaceAccent {
    return WORKSPACE_ACCENTS[hashPath(path) % WORKSPACE_ACCENTS.length]!
}

export function resolveWorkspaceFolderName(path: string, defaultLabel: string, isDefault = false): string {
    if (isDefault) return defaultLabel
    const segments = path.replace(/[/\\]+$/, '').split(/[/\\]/)
    const name = segments[segments.length - 1]
    return name || defaultLabel
}

export function resolveWorkspaceInitials(name: string): string {
    const trimmed = name.trim()
    if (!trimmed) return '?'
    const parts = trimmed.split(/[-_\s.]+/).filter(Boolean)
    if (parts.length >= 2) {
        return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
    }
    if (trimmed.length >= 2) return trimmed.slice(0, 2).toUpperCase()
    return trimmed.slice(0, 1).toUpperCase()
}

/** Keep drive/root and leaf folder when path is too long for a narrow menu. */
export function truncateWorkspacePath(path: string, maxLen = 42): string {
    const normalized = path.trim()
    if (normalized.length <= maxLen) return normalized
    const sep = normalized.includes('\\') ? '\\' : '/'
    const parts = normalized.replace(/[/\\]+$/, '').split(/[/\\]/)
    const leaf = parts[parts.length - 1] || ''
    const head = parts[0] || ''
    if (!leaf || !head) {
        return `${normalized.slice(0, Math.max(8, maxLen - 1))}…`
    }
    const marker = `${sep}…${sep}`
    const budget = maxLen - leaf.length - marker.length
    if (budget < head.length) {
        return `${head.slice(0, Math.max(4, budget))}…${sep}${leaf}`
    }
    return `${head}${marker}${leaf}`
}
