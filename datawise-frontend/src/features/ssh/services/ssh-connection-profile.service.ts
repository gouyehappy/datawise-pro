import type {MyCommandMode} from '@/features/ssh/services/ssh-my-commands.service'

const STORAGE_PREFIX = 'ssh-connection-profile:'

export interface SshConnectionProfile {
    tabNote?: string
    onConnectCommand?: string
    onConnectMode?: MyCommandMode
    defaultCwd?: string
}

function storageKey(connectionId: string): string {
    return `${STORAGE_PREFIX}${connectionId}`
}

export function readSshConnectionProfile(connectionId: string): SshConnectionProfile {
    if (!connectionId) return {}
    try {
        const raw = localStorage.getItem(storageKey(connectionId))
        if (!raw) return {}
        const parsed = JSON.parse(raw) as SshConnectionProfile
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

export function writeSshConnectionProfile(
    connectionId: string,
    profile: SshConnectionProfile,
): SshConnectionProfile {
    if (!connectionId) return profile
    const normalized: SshConnectionProfile = {
        tabNote: profile.tabNote?.trim() || undefined,
        onConnectCommand: profile.onConnectCommand?.trim() || undefined,
        onConnectMode: profile.onConnectMode === 'run' ? 'run' : profile.onConnectMode === 'paste' ? 'paste' : undefined,
        defaultCwd: profile.defaultCwd?.trim() || undefined,
    }
    try {
        if (
            !normalized.tabNote
            && !normalized.onConnectCommand
            && !normalized.defaultCwd
        ) {
            localStorage.removeItem(storageKey(connectionId))
        } else {
            localStorage.setItem(storageKey(connectionId), JSON.stringify(normalized))
        }
    } catch {
        // ignore
    }
    return normalized
}
