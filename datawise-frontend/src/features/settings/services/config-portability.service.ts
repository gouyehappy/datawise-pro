import {API_PATHS} from '@/shared/api/http/paths'
import {buildApiUrl, buildSessionHeaders} from '@/shared/api/http/request'

function sessionHeaders(): Record<string, string> {
    return buildSessionHeaders()
}

export interface ProfileDomainOptions {
    connections: boolean
    app: boolean
    snippets: boolean
    aiWorkspace: boolean
    projects: boolean
    savedConsoles: boolean
    sqlHistory: boolean
    appSections?: string[]
    projectFileConflict?: 'preferImported' | 'keepLocal'
}

export interface ProfileExportRequest {
    passphrase?: string
    confirmPassphrase?: string
    domains: ProfileDomainOptions
    /** When set, only these connection ids are exported in the connections domain. */
    connectionIds?: string[]
    /** When set (and connectionIds empty), export all connections in this project. */
    projectId?: string
    /**
     * Default (unset/true): passphrase-seal secrets for machine migration.
     * False: cloud-sync package with secretMode=omitted.
     */
    includeSecrets?: boolean
}

export interface ProfileConflictItem {
    domain: string
    id: string
    name: string
    action: string
}

export interface ProfilePreflightResult {
    passphraseOk: boolean
    schemaCompatible: boolean
    manifest?: {
        kind?: string
        schemaVersion?: number
        appVersion?: string
        secretMode?: string
        domains?: string[]
        warnings?: string[]
        counts?: Record<string, unknown>
    }
    warnings: string[]
    conflicts: ProfileConflictItem[]
    counts: Record<string, unknown>
    legacyKind?: string | null
}

export interface ProfileImportResult {
    success: boolean
    appliedDomains: string[]
    warnings: string[]
    counts: Record<string, unknown>
    restartRecommended: boolean
}

export const DEFAULT_PROFILE_DOMAINS: ProfileDomainOptions = {
    connections: true,
    app: true,
    snippets: true,
    aiWorkspace: true,
    projects: true,
    savedConsoles: true,
    sqlHistory: true,
    projectFileConflict: 'preferImported',
}

export async function exportProfilePackage(request: ProfileExportRequest): Promise<{
    blob: Blob
    fileName: string
}> {
    const response = await fetch(buildApiUrl(API_PATHS.config.portability.export), {
        method: 'POST',
        headers: {
            ...sessionHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        credentials: 'include',
        signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) {
        throw new Error(await readHttpError(response, `Export failed: HTTP ${response.status}`))
    }
    const disposition = response.headers.get('Content-Disposition') || ''
    const match = /filename="?([^";]+)"?/i.exec(disposition)
    const blob = await response.blob()
    return {blob, fileName: match?.[1] ?? 'datawise-profile.dwprofile'}
}

export async function preflightProfilePackage(
    file: File,
    passphrase: string = '',
): Promise<ProfilePreflightResult> {
    const form = new FormData()
    form.append('file', file)
    form.append('passphrase', passphrase ?? '')
    const response = await fetch(buildApiUrl(API_PATHS.config.portability.importPreflight), {
        method: 'POST',
        headers: sessionHeaders(),
        body: form,
        credentials: 'include',
        signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) {
        throw new Error(await readHttpError(response, `Preflight failed: HTTP ${response.status}`))
    }
    const payload = await response.json() as {code: number; msg?: string; data: ProfilePreflightResult}
    if (payload.code !== 0) {
        throw new Error(payload.msg || 'Preflight failed')
    }
    return payload.data
}

export async function importProfilePackage(
    file: File,
    passphrase: string = '',
    domains: ProfileDomainOptions = DEFAULT_PROFILE_DOMAINS,
): Promise<ProfileImportResult> {
    const form = new FormData()
    form.append('file', file)
    form.append('passphrase', passphrase ?? '')
    form.append('options', JSON.stringify({domains}))
    const response = await fetch(buildApiUrl(API_PATHS.config.portability.import), {
        method: 'POST',
        headers: sessionHeaders(),
        body: form,
        credentials: 'include',
        signal: AbortSignal.timeout(180_000),
    })
    if (!response.ok) {
        throw new Error(await readHttpError(response, `Import failed: HTTP ${response.status}`))
    }
    const payload = await response.json() as {code: number; msg?: string; data: ProfileImportResult}
    if (payload.code !== 0) {
        throw new Error(payload.msg || 'Import failed')
    }
    return payload.data
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

export function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
}

export type ExportSaveDestination =
    | {mode: 'desktop'; path: string}
    | {mode: 'picker'; handle: FileSystemFileHandle}
    | {mode: 'download'}

/** Ask where to write an export. Returns null when the user cancels the dialog. */
export async function promptExportSaveDestination(
    suggestedName: string,
): Promise<ExportSaveDestination | null> {
    const selectSaveFile = window.datawise?.fs?.selectSaveFile
    if (selectSaveFile) {
        const path = await selectSaveFile(suggestedName, 'dwprofile')
        return path ? {mode: 'desktop', path} : null
    }
    const savePicker = (window as unknown as {
        showSaveFilePicker?: (options: {
            suggestedName?: string
            types?: Array<{description?: string; accept?: Record<string, string[]>}>
        }) => Promise<FileSystemFileHandle>
    }).showSaveFilePicker
    if (typeof savePicker === 'function') {
        try {
            const handle = await savePicker({
                suggestedName,
                types: [{
                    description: 'DataWise profile',
                    accept: {'application/octet-stream': ['.dwprofile']},
                }],
            })
            return {mode: 'picker', handle}
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return null
        }
    }
    return {mode: 'download'}
}

export async function commitExportSaveDestination(
    destination: ExportSaveDestination,
    blob: Blob,
    fallbackName: string,
): Promise<string | undefined> {
    if (destination.mode === 'desktop') {
        const writeBinaryFile = window.datawise?.fs?.writeBinaryFile
        if (!writeBinaryFile) throw new Error('write_failed')
        const result = await writeBinaryFile(destination.path, await blobToBase64(blob))
        if (!result?.ok) throw new Error(result?.error || 'write_failed')
        return result.path || destination.path
    }
    if (destination.mode === 'picker') {
        const writable = await destination.handle.createWritable()
        await writable.write(blob)
        await writable.close()
        return destination.handle.name
    }
    downloadBlob(blob, fallbackName)
    return undefined
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const dataUrl = String(reader.result ?? '')
            const comma = dataUrl.indexOf(',')
            resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl)
        }
        reader.onerror = () => reject(reader.error ?? new Error('read_failed'))
        reader.readAsDataURL(blob)
    })
}
