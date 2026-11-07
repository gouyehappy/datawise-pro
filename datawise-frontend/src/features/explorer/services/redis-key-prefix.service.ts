export interface RedisKeyPrefixGroup {
    prefix: string
    label: string
    pattern: string
    keys: string[]
}

const NO_PREFIX = '__no_prefix__'

export function groupRedisKeysByPrefix(keys: string[]): RedisKeyPrefixGroup[] {
    const buckets = new Map<string, string[]>()
    for (const key of keys) {
        const colon = key.indexOf(':')
        const prefix = colon > 0 ? key.slice(0, colon + 1) : NO_PREFIX
        const list = buckets.get(prefix) ?? []
        list.push(key)
        buckets.set(prefix, list)
    }

    return [...buckets.entries()]
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .map(([prefix, groupedKeys]) => ({
            prefix,
            label: prefix === NO_PREFIX ? '(other)' : prefix,
            pattern: prefix === NO_PREFIX ? '*' : `${prefix}*`,
            keys: groupedKeys.sort((a, b) => a.localeCompare(b)),
        }))
}

export function derivePrefixPatterns(keys: string[], limit = 8): string[] {
    return groupRedisKeysByPrefix(keys)
        .filter((group) => group.prefix !== NO_PREFIX)
        .slice(0, limit)
        .map((group) => group.pattern)
}

export function filterRedisKeys(keys: string[], query: string): string[] {
    const q = query.trim().toLowerCase()
    if (!q) return keys
    return keys.filter((key) => key.toLowerCase().includes(q))
}
