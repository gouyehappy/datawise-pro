import type {ConnectionChallenge} from '@/features/community-plugin/lib/runCommunityPluginConnectionTest'

/**
 * Host-side trust store for community-plugin connection challenges (TOFU).
 * When the user accepts a challenge with "remember", later challenges presenting
 * the same fingerprint for the same host/port/kind are auto-accepted without
 * prompting. Storage lives in the host SPA's localStorage — plugin UIs never see it.
 */

const STORAGE_KEY = 'dwPluginChallengeTrust'
const MAX_ENTRIES = 500

export type RememberedChallenge = {
    pluginId: string
    kind: string
    host: string
    port: string
    fingerprint: string
    keyType?: string
    savedAt: number
}

function loadAll(): RememberedChallenge[] {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) return []
        return parsed.filter((entry): entry is RememberedChallenge =>
            Boolean(entry) && typeof entry === 'object'
            && typeof (entry as RememberedChallenge).pluginId === 'string'
            && typeof (entry as RememberedChallenge).fingerprint === 'string'
            && Boolean((entry as RememberedChallenge).fingerprint),
        )
    } catch {
        return []
    }
}

function saveAll(entries: RememberedChallenge[]) {
    try {
        const trimmed = entries.slice(-MAX_ENTRIES)
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    } catch {
        // Storage unavailable — remembering silently degrades to always prompt.
    }
}

function sameRemote(a: RememberedChallenge, pluginId: string, challenge: ConnectionChallenge): boolean {
    if (a.pluginId !== pluginId) return false
    if (a.host !== String(challenge.host || '').trim()) return false
    if (String(a.port) !== String(challenge.port ?? '').trim()) return false
    if (a.kind !== (challenge.kind || 'host-key').trim()) return false
    return a.fingerprint === String(challenge.fingerprint || '').trim()
}

/** Auto-accept decision when this exact fingerprint was remembered before. */
export function findRememberedChallenge(
    pluginId: string,
    challenge: ConnectionChallenge,
): RememberedChallenge | null {
    const fingerprint = String(challenge.fingerprint || '').trim()
    if (!fingerprint) return null
    const kind = (challenge.kind || 'host-key').trim()
    const host = String(challenge.host || '').trim()
    const port = String(challenge.port ?? '').trim()
    return loadAll().find((entry) =>
        entry.pluginId === pluginId
        && entry.kind === kind
        && entry.host === host
        && entry.port === port
        && entry.fingerprint === fingerprint,
    ) ?? null
}

export function rememberChallenge(pluginId: string, challenge: ConnectionChallenge) {
    const fingerprint = String(challenge.fingerprint || '').trim()
    if (!fingerprint) return
    const entries = loadAll().filter((entry) => !sameRemote(entry, pluginId, challenge))
    entries.push({
        pluginId,
        kind: (challenge.kind || 'host-key').trim(),
        host: String(challenge.host || '').trim(),
        port: String(challenge.port ?? '').trim(),
        fingerprint,
        keyType: challenge.keyType?.trim() || undefined,
        savedAt: Date.now(),
    })
    saveAll(entries)
}

export function forgetChallenge(pluginId: string, challenge: ConnectionChallenge) {
    const kept = loadAll().filter((entry) => !sameRemote(entry, pluginId, challenge))
    saveAll(kept)
}

/** All remembered fingerprints, newest first — for the settings management UI. */
export function listRememberedChallenges(): RememberedChallenge[] {
    return loadAll().sort((a, b) => b.savedAt - a.savedAt)
}

export function removeRememberedChallenge(entry: RememberedChallenge) {
    const kept = loadAll().filter((item) =>
        !(item.pluginId === entry.pluginId
            && item.kind === entry.kind
            && item.host === entry.host
            && item.port === entry.port
            && item.fingerprint === entry.fingerprint),
    )
    saveAll(kept)
}
