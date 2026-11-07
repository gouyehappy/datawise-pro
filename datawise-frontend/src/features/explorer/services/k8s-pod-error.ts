/** True when Kubernetes reports the pod (or related object) as missing. */
export function isK8sPodGoneError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '')
    const lower = message.toLowerCase()
    return lower.includes('404')
        || lower.includes('notfound')
        || lower.includes('not found')
}
