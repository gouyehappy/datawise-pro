/** Shared advancedConfig line helpers (key=value). */

export function readAdvancedProperty(advancedConfig: string | undefined, key: string): string | undefined {
    if (!advancedConfig?.trim()) return undefined
    const prefix = `${key.toLowerCase()}=`
    for (const line of advancedConfig.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        if (trimmed.toLowerCase().startsWith(prefix)) {
            const value = trimmed.slice(trimmed.indexOf('=') + 1).trim()
            return value || undefined
        }
    }
    return undefined
}

export function upsertAdvancedProperty(
    advancedConfig: string | undefined,
    key: string,
    value: string,
): string {
    const lines = (advancedConfig ?? '').split(/\r?\n/)
    const prefix = `${key.toLowerCase()}=`
    let found = false
    const next = lines.map((line) => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) return line
        if (!trimmed.toLowerCase().startsWith(prefix)) return line
        found = true
        return `${key}=${value}`
    })
    if (!found) {
        if (next.some((line) => line.trim())) next.push(`${key}=${value}`)
        else return `${key}=${value}`
    }
    return next.join('\n').replace(/\n+$/, '')
}

export function removeAdvancedProperty(advancedConfig: string | undefined, key: string): string {
    const prefix = `${key.toLowerCase()}=`
    const lines = (advancedConfig ?? '').split(/\r?\n/).filter((line) => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) return true
        return !trimmed.toLowerCase().startsWith(prefix)
    })
    return lines.join('\n').replace(/^\n+|\n+$/g, '')
}
