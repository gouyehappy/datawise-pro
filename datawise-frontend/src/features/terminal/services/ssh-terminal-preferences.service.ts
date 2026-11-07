const STORAGE_KEY = 'ssh-auto-reconnect'

export function readSshAutoReconnectEnabled(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
        return false
    }
}

export function writeSshAutoReconnectEnabled(enabled: boolean): void {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
}
