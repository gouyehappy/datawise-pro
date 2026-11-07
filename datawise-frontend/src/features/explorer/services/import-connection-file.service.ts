/** True when the chosen file is a profile portability package (.dwprofile), not a JSON snapshot. */
export function isConnectionProfilePackage(file: File): boolean {
    const name = file.name.trim().toLowerCase()
    return name.endsWith('.dwprofile')
}

export function profileImportConnectionCount(counts: Record<string, unknown> | undefined): number {
    const raw = counts?.connections
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}
