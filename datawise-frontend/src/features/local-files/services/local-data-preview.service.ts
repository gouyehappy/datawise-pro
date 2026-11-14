/**
 * T-FILE-1：本地 Parquet/CSV/JSON 预览 — 按插件声明匹配，零硬编码 pluginId。
 */
import {createHttpCommunityPluginsApi} from '@/shared/api/http/community-plugins'
import {createHttpExplorerApi} from '@/shared/api/http/explorer'
import {t} from '@/i18n'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {
    connectAndOpenCommunityPluginWorkbench,
    listSavedPluginConnections,
} from '@/features/community-plugin/lib/connectCommunityPluginWorkbench'
import {fileExtension, localFileBaseName} from '@/features/local-files/services/local-files-path'
import {createDefaultConnection} from '@/features/connection/utils/connection-defaults'
import type {ConnectionConfig} from '@/core/types'

export const LOCAL_DATA_PREVIEW_EXTENSIONS = [
    '.parquet',
    '.csv',
    '.tsv',
    '.json',
    '.jsonl',
] as const

export type LocalDataPreviewExtension = (typeof LOCAL_DATA_PREVIEW_EXTENSIONS)[number]

export function isLocalDataPreviewFileName(pathOrName: string): boolean {
    const ext = fileExtension(pathOrName)
    return (LOCAL_DATA_PREVIEW_EXTENSIONS as readonly string[]).includes(ext)
}

export type LocalDataPreviewProvider = {
    pluginId: string
    providerId: string
    pluginName: string
    extensions: string[]
}

function normalizeExt(raw: string): string {
    const s = raw.trim().toLowerCase()
    if (!s) return ''
    return s.startsWith('.') ? s : `.${s}`
}

function parentDir(filePath: string): string {
    const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
    if (idx <= 0) return filePath
    return filePath.slice(0, idx)
}

/** Scan installed plugins for connection-provider.localDataPreview.extensions. */
export async function listLocalDataPreviewProviders(): Promise<LocalDataPreviewProvider[]> {
    const api = createHttpCommunityPluginsApi()
    const installed = await api.list()
    const out: LocalDataPreviewProvider[] = []
    for (const info of installed) {
        const pluginId = info.manifest?.id?.trim()
        if (!pluginId) continue
        const contributions = (info.manifest.contributions || []) as Array<Record<string, unknown>>
        for (const c of contributions) {
            if (c.type !== 'connection-provider' || typeof c.id !== 'string') continue
            const preview = c.localDataPreview as {extensions?: unknown} | undefined
            const rawExts = preview?.extensions
            if (!Array.isArray(rawExts) || !rawExts.length) continue
            const extensions = rawExts
                .map((e) => normalizeExt(String(e)))
                .filter(Boolean)
            if (!extensions.length) continue
            out.push({
                pluginId,
                providerId: c.id,
                pluginName: info.manifest.name || pluginId,
                extensions,
            })
        }
    }
    return out
}

export function matchLocalDataPreviewProvider(
    providers: LocalDataPreviewProvider[],
    filePath: string,
): LocalDataPreviewProvider | null {
    const ext = fileExtension(filePath)
    if (!ext) return null
    return providers.find((p) => p.extensions.includes(ext)) ?? null
}

async function ensurePreviewConnection(
    provider: LocalDataPreviewProvider,
    filePath: string,
): Promise<ConnectionConfig> {
    const saved = await listSavedPluginConnections(provider.pluginId)
    if (saved.length) return saved[0]!

    const explorerApi = createHttpExplorerApi()
    const base = createDefaultConnection('plugin')
    const name = `${provider.pluginName} · preview`
    const draft: ConnectionConfig = {
        ...base,
        id: `new-preview-${Date.now()}`,
        name,
        dbType: 'plugin',
        pluginId: provider.pluginId,
        pluginConnectionProvider: provider.providerId,
        host: '',
        port: '',
        user: '',
        password: '',
        advancedConfig: JSON.stringify({
            databasePath: ':memory:',
            dataDir: parentDir(filePath),
            readOnly: true,
        }),
    }
    await explorerApi.importConnections([draft])
    const after = await listSavedPluginConnections(provider.pluginId)
    const hit = after.find((c) => (c.name || '').includes('preview')) || after[0]
    if (!hit) {
        throw new Error('Failed to create preview connection')
    }
    return hit
}

/**
 * Open a local data file in a matching community-plugin workbench.
 * @returns true when workbench was opened
 */
export async function previewLocalDataFile(filePath: string): Promise<boolean> {
    const layout = useLayoutStore()
    const workspace = useWorkspaceStore()
    const trimmed = filePath.trim()
    if (!trimmed || !isLocalDataPreviewFileName(trimmed)) {
        layout.showErrorToast(t('explorer.localFiles.unsupportedFile'))
        return false
    }

    let providers: LocalDataPreviewProvider[]
    try {
        providers = await listLocalDataPreviewProviders()
    } catch {
        layout.showErrorToast(t('explorer.localDataPreview.listFailed'))
        return false
    }

    const provider = matchLocalDataPreviewProvider(providers, trimmed)
    if (!provider) {
        layout.showWarningToast(t('explorer.localDataPreview.needPlugin'))
        workspace.openCommunityPluginCenter()
        return false
    }

    try {
        const connection = await ensurePreviewConnection(provider, trimmed)
        const result = await connectAndOpenCommunityPluginWorkbench(connection.id, {
            title: `${localFileBaseName(trimmed)} · ${provider.pluginName}`,
            intent: {
                action: 'preview-local-file',
                uri: trimmed,
            },
            forceNew: true,
        })
        if (!result.ok) {
            layout.showErrorToast(result.message || t('explorer.localDataPreview.openFailed'))
            return false
        }
        layout.setModule('database')
        return true
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        layout.showErrorToast(message || t('explorer.localDataPreview.openFailed'))
        return false
    }
}
