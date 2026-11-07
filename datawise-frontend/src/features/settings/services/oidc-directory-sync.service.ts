/** OIDC directory-sync (G2) scope / claim-map helpers for Settings → Integrations. */

export function parseClaimMap(text: string): Record<string, string> {
    const map: Record<string, string> = {}
    for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const idx = trimmed.indexOf('=')
        if (idx <= 0) continue
        const key = trimmed.slice(0, idx).trim()
        const value = trimmed.slice(idx + 1).trim()
        if (key && value) map[key] = value
    }
    return map
}

export function formatClaimMap(map?: Record<string, string> | null): string {
    if (!map) return ''
    return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('\n')
}

export function scopeTokens(scopes: string): string[] {
    return scopes
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter(Boolean)
}

/** True when role sync is on but scopes likely omit groups / the role claim name. */
export function directorySyncScopesIncomplete(scopes: string, roleClaim: string): boolean {
    const set = new Set(scopeTokens(scopes).map((s) => s.toLowerCase()))
    const claim = (roleClaim || 'groups').trim().toLowerCase() || 'groups'
    if (claim === 'groups' || claim === 'roles') {
        return !set.has(claim) && !set.has('groups')
    }
    // Custom claims still usually need the IdP `groups` scope to emit group memberships.
    return !set.has('groups')
}

/** Append recommended scopes (idempotent). */
export function withRecommendedDirectorySyncScopes(scopes: string, roleClaim: string): string {
    const tokens = scopeTokens(scopes)
    const set = new Set(tokens.map((s) => s.toLowerCase()))
    const claim = (roleClaim || 'groups').trim()
    const add: string[] = []
    if (!set.has('groups')) add.push('groups')
    const claimLower = claim.toLowerCase()
    if (claim && claimLower !== 'groups' && (claimLower === 'roles') && !set.has(claimLower)) {
        add.push(claim)
    }
    return [...tokens, ...add].join(' ')
}

export function claimMapPreviewRows(text: string): Array<{from: string; to: string}> {
    return Object.entries(parseClaimMap(text)).map(([from, to]) => ({from, to}))
}
