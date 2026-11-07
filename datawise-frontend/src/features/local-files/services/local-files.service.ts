import {readDatawiseHost} from '@/features/layout/services/desktop-bridge'

export type LocalDirEntry = {
    name: string
    path: string
    isDirectory: boolean
    size: number
    mtimeMs: number
}

export function canUseLocalFilesWorkspace(): boolean {
    const fs = readDatawiseHost()?.fs
    // readTextFile is required on the typed host; listDir/writeTextFile gate full workspace support.
    return Boolean(fs?.selectDirectory && fs.listDir && fs.writeTextFile)
}

export async function pickLocalFilesRoot(): Promise<string | null> {
    const fs = readDatawiseHost()?.fs
    if (!fs?.selectDirectory) return null
    const path = await fs.selectDirectory()
    return path?.trim() || null
}

export async function registerLocalFilesRoot(path: string): Promise<boolean> {
    const fs = readDatawiseHost()?.fs
    if (!path.trim()) return false
    if (fs?.registerRoot) {
        const result = await fs.registerRoot(path)
        return Boolean(result?.ok)
    }
    // selectDirectory already registers on host; registerRoot is for recent reopen
    return Boolean(fs?.listDir)
}

export async function listLocalDirectory(
    path: string,
    includeHidden = true,
): Promise<LocalDirEntry[]> {
    const fs = readDatawiseHost()?.fs
    if (!fs?.listDir) throw new Error('listDir unsupported')
    const result = await fs.listDir(path, includeHidden)
    if (!result?.ok || !result.entries) {
        throw new Error(result?.error || 'list_failed')
    }
    return result.entries
}

export type LocalFileStat = {
    exists: boolean
    path?: string
    isDirectory?: boolean
    size?: number
    mtimeMs?: number
}

export async function statLocal(path: string): Promise<LocalFileStat> {
    const fs = readDatawiseHost()?.fs
    if (!fs?.stat) {
        // Fallback when desktop build predates fs:stat: probe via parent list.
        const parent = path.replace(/[/\\][^/\\]+$/, '')
        const base = path.split(/[/\\]/).pop() || path
        if (!parent || !fs?.listDir) {
            return {exists: false, path}
        }
        try {
            const entries = await listLocalDirectory(parent, true)
            const hit = entries.find((item) => item.name === base)
            if (!hit) return {exists: false, path}
            return {
                exists: true,
                path: hit.path,
                isDirectory: hit.isDirectory,
                size: hit.size,
                mtimeMs: hit.mtimeMs,
            }
        } catch {
            return {exists: false, path}
        }
    }
    const result = await fs.stat(path)
    if (!result?.ok || !result.stat) {
        throw new Error(result?.error || 'stat_failed')
    }
    return result.stat
}

export async function readLocalTextFile(path: string): Promise<string> {
    const fs = readDatawiseHost()?.fs
    if (!fs?.readTextFile) throw new Error('readTextFile unsupported')
    const result = await fs.readTextFile(path)
    if (!result?.ok || result.content == null) {
        throw new Error(result?.error || 'read_failed')
    }
    return result.content
}

/** Read a local binary file as a data URL (images for markdown preview). */
export async function readLocalFileDataUrl(path: string): Promise<string> {
    const fs = readDatawiseHost()?.fs
    if (!fs?.readFileDataUrl) throw new Error('readFileDataUrl unsupported')
    const result = await fs.readFileDataUrl(path)
    if (!result?.ok || !result.dataUrl) {
        throw new Error(result?.error || 'read_failed')
    }
    return result.dataUrl
}

export async function writeLocalTextFile(path: string, content: string): Promise<void> {
    const fs = readDatawiseHost()?.fs
    if (!fs?.writeTextFile) throw new Error('writeTextFile unsupported')
    const result = await fs.writeTextFile(path, content)
    if (!result?.ok) {
        throw new Error(result?.error || 'write_failed')
    }
}

export async function mkdirLocal(path: string): Promise<string> {
    const fs = readDatawiseHost()?.fs
    if (!fs?.mkdir) throw new Error('mkdir unsupported')
    const result = await fs.mkdir(path)
    if (!result?.ok || !result.path) {
        throw new Error(result?.error || 'mkdir_failed')
    }
    return result.path
}

export async function renameLocal(from: string, to: string): Promise<string> {
    const fs = readDatawiseHost()?.fs
    if (!fs?.rename) throw new Error('rename unsupported')
    const result = await fs.rename(from, to)
    if (!result?.ok || !result.path) {
        throw new Error(result?.error || 'rename_failed')
    }
    return result.path
}

export async function deleteLocal(path: string, recursive = false): Promise<void> {
    const fs = readDatawiseHost()?.fs
    if (!fs?.delete) throw new Error('delete unsupported')
    const result = await fs.delete(path, recursive)
    if (!result?.ok) {
        throw new Error(result?.error || 'delete_failed')
    }
}

export async function revealLocalInExplorer(path: string): Promise<void> {
    const fs = readDatawiseHost()?.fs
    if (!fs?.revealInExplorer) throw new Error('reveal unsupported')
    const result = await fs.revealInExplorer(path)
    if (!result?.ok) {
        throw new Error(result?.error || 'reveal_failed')
    }
}

export async function openLocalInTerminal(path: string): Promise<void> {
    const fs = readDatawiseHost()?.fs
    if (!fs?.openInTerminal) throw new Error('openInTerminal unsupported')
    const result = await fs.openInTerminal(path)
    if (!result?.ok) {
        throw new Error(result?.error || 'terminal_failed')
    }
}

export async function copyTextToClipboard(text: string): Promise<void> {
    const host = readDatawiseHost()
    if (host?.clipboard?.writeText) {
        await host.clipboard.writeText(text)
        return
    }
    await navigator.clipboard.writeText(text)
}
