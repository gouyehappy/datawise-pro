import {API_PATHS} from '@/shared/api/http/paths'
import {buildApiUrl, buildSessionHeaders} from '@/shared/api/http/request'
import type {ProfileDomainOptions, ProfileExportRequest} from '@/features/settings/services/config-portability.service'

function sessionHeaders(): Record<string, string> {
    return buildSessionHeaders()
}

export interface CloudSyncWebDavSettings {
    baseUrl: string
    username: string
    password: string
    hasPassword: boolean
    remotePath: string
}

export const DEFAULT_SYNC_DOMAINS: ProfileDomainOptions = {
    connections: true,
    app: true,
    snippets: true,
    aiWorkspace: false,
    projects: false,
    savedConsoles: true,
    sqlHistory: false,
    projectFileConflict: 'preferImported',
}

async function readHttpError(response: Response, fallback: string): Promise<string> {
    const text = await response.text().catch(() => '')
    if (!text) return fallback
    try {
        const json = JSON.parse(text) as {msg?: string; message?: string}
        return json.msg || json.message || text
    } catch {
        return text
    }
}

export async function fetchCloudSyncSettings(): Promise<CloudSyncWebDavSettings> {
    const response = await fetch(buildApiUrl(API_PATHS.config.cloudSync.settings), {
        method: 'GET',
        headers: sessionHeaders(),
        credentials: 'include',
        signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) {
        throw new Error(await readHttpError(response, `Load sync settings failed: HTTP ${response.status}`))
    }
    const payload = await response.json() as {code: number; msg?: string; data: CloudSyncWebDavSettings}
    if (payload.code !== 0) {
        throw new Error(payload.msg || 'Load sync settings failed')
    }
    return {
        baseUrl: payload.data?.baseUrl || '',
        username: payload.data?.username || '',
        password: '',
        hasPassword: Boolean(payload.data?.hasPassword),
        remotePath: payload.data?.remotePath || 'datawise/profile-sync.dwprofile',
    }
}

export async function saveCloudSyncSettings(
    settings: CloudSyncWebDavSettings,
): Promise<CloudSyncWebDavSettings> {
    const response = await fetch(buildApiUrl(API_PATHS.config.cloudSync.settings), {
        method: 'PUT',
        headers: {
            ...sessionHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            baseUrl: settings.baseUrl,
            username: settings.username,
            password: settings.password,
            remotePath: settings.remotePath,
        }),
        credentials: 'include',
        signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) {
        throw new Error(await readHttpError(response, `Save sync settings failed: HTTP ${response.status}`))
    }
    const payload = await response.json() as {code: number; msg?: string; data: CloudSyncWebDavSettings}
    if (payload.code !== 0) {
        throw new Error(payload.msg || 'Save sync settings failed')
    }
    return {
        baseUrl: payload.data?.baseUrl || '',
        username: payload.data?.username || '',
        password: '',
        hasPassword: Boolean(payload.data?.hasPassword),
        remotePath: payload.data?.remotePath || 'datawise/profile-sync.dwprofile',
    }
}

export async function testCloudSyncWebDav(settings?: Partial<CloudSyncWebDavSettings>): Promise<void> {
    const response = await fetch(buildApiUrl(API_PATHS.config.cloudSync.webdavTest), {
        method: 'POST',
        headers: {
            ...sessionHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings || {}),
        credentials: 'include',
        signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) {
        throw new Error(await readHttpError(response, `WebDAV test failed: HTTP ${response.status}`))
    }
    const payload = await response.json() as {code: number; msg?: string}
    if (payload.code !== 0) {
        throw new Error(payload.msg || 'WebDAV test failed')
    }
}

export async function uploadCloudSyncWebDav(
    domains: ProfileDomainOptions,
    settings?: Partial<CloudSyncWebDavSettings>,
    includeSecrets = false,
): Promise<void> {
    const exportBody: ProfileExportRequest = {
        domains,
        includeSecrets,
    }
    const response = await fetch(buildApiUrl(API_PATHS.config.cloudSync.webdavUpload), {
        method: 'POST',
        headers: {
            ...sessionHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            export: exportBody,
            webdav: settings || undefined,
        }),
        credentials: 'include',
        signal: AbortSignal.timeout(180_000),
    })
    if (!response.ok) {
        throw new Error(await readHttpError(response, `WebDAV upload failed: HTTP ${response.status}`))
    }
    const payload = await response.json() as {code: number; msg?: string}
    if (payload.code !== 0) {
        throw new Error(payload.msg || 'WebDAV upload failed')
    }
}

export async function downloadCloudSyncWebDav(
    settings?: Partial<CloudSyncWebDavSettings>,
): Promise<{blob: Blob; fileName: string}> {
    const response = await fetch(buildApiUrl(API_PATHS.config.cloudSync.webdavDownload), {
        method: 'POST',
        headers: {
            ...sessionHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings || {}),
        credentials: 'include',
        signal: AbortSignal.timeout(180_000),
    })
    if (!response.ok) {
        throw new Error(await readHttpError(response, `WebDAV download failed: HTTP ${response.status}`))
    }
    const disposition = response.headers.get('Content-Disposition') || ''
    const match = /filename="?([^";]+)"?/i.exec(disposition)
    const blob = await response.blob()
    return {blob, fileName: match?.[1] ?? 'datawise-sync.dwprofile'}
}
