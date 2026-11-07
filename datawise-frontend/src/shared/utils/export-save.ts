/**
 * Shared export save helpers: prefer workspace exports/ on desktop, else browser download.
 */

export type ExportSaveResult = {
    fileName: string
    /** Absolute path when written to disk; undefined for browser download. */
    path?: string
    mode: 'workspace' | 'desktop-dialog' | 'picker' | 'download'
}

function joinPath(root: string, segment: string): string {
    const trimmed = root.replace(/[/\\]+$/, '')
    const sep = trimmed.includes('\\') ? '\\' : '/'
    return `${trimmed}${sep}${segment}`
}

async function blobToBase64(blob: Blob): Promise<string> {
    if (typeof FileReader !== 'undefined') {
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
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
}

function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
}

async function resolveWorkspaceRoot(): Promise<string | null> {
    const getSettings = window.datawise?.config?.getSettings
    if (!getSettings) return null
    try {
        const settings = await getSettings()
        const root = settings?.resolved?.trim()
        return root || null
    } catch {
        return null
    }
}

function extensionOf(fileName: string): string {
    const match = fileName.match(/\.([^.]+)$/)
    return match?.[1]?.toLowerCase() ?? ''
}

/**
 * Save an export blob.
 * Desktop: write under `{workspace}/exports/` when possible; otherwise save dialog.
 * Browser: native download (Downloads folder).
 */
export async function saveExportBlob(blob: Blob, fileName: string): Promise<ExportSaveResult> {
    const fs = window.datawise?.fs
    const writeBinaryFile = fs?.writeBinaryFile
    const ext = extensionOf(fileName)

    const workspaceRoot = await resolveWorkspaceRoot()
    if (workspaceRoot && writeBinaryFile && fs?.registerRoot && fs?.mkdir) {
        try {
            const registered = await fs.registerRoot(workspaceRoot)
            if (registered?.ok === false) throw new Error(registered.error || 'register_failed')
            const exportsDir = joinPath(workspaceRoot, 'exports')
            const created = await fs.mkdir(exportsDir)
            if (created?.ok === false) throw new Error(created.error || 'mkdir_failed')
            const targetPath = joinPath(exportsDir, fileName)
            const result = await writeBinaryFile(targetPath, await blobToBase64(blob))
            if (result?.ok) {
                return {
                    fileName,
                    path: result.path || targetPath,
                    mode: 'workspace',
                }
            }
        } catch {
            // fall through to dialog / download
        }
    }

    const selectSaveFile = fs?.selectSaveFile
    if (selectSaveFile && writeBinaryFile) {
        const path = await selectSaveFile(fileName, ext)
        if (!path) {
            throw new DOMException('User cancelled save', 'AbortError')
        }
        const result = await writeBinaryFile(path, await blobToBase64(blob))
        if (!result?.ok) throw new Error(result?.error || 'write_failed')
        return {
            fileName,
            path: result.path || path,
            mode: 'desktop-dialog',
        }
    }

    const savePicker = (window as unknown as {
        showSaveFilePicker?: (options: {
            suggestedName?: string
            types?: Array<{description?: string; accept?: Record<string, string[]>}>
        }) => Promise<FileSystemFileHandle>
    }).showSaveFilePicker
    if (typeof savePicker === 'function') {
        try {
            const handle = await savePicker({suggestedName: fileName})
            const writable = await handle.createWritable()
            await writable.write(blob)
            await writable.close()
            return {fileName: handle.name || fileName, mode: 'picker'}
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') throw error
        }
    }

    downloadBlob(blob, fileName)
    return {fileName, mode: 'download'}
}
