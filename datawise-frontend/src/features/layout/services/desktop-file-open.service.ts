import {t} from '@/i18n'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {readDatawiseHost} from '@/features/layout/services/desktop-bridge'
import {isLocalSqlFileName, isLocalTextFileName} from '@/features/local-files/services/local-files-path'
import {openLocalWorkspaceFile} from '@/features/local-files/services/open-local-file.service'
import {createHttpCommunityPluginsApi} from '@/shared/api/http/community-plugins'
import {askAppConfirm} from '@/core/services/app-confirm.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api/http/api-error-message'

export interface DesktopFileOpenPayload {
    path: string
    kind?: string
}

export function fileBaseName(path: string): string {
    const normalized = path.replace(/\\/g, '/')
    const parts = normalized.split('/')
    return parts[parts.length - 1] || path
}

/** Open a local file pushed by the desktop host (double-click / Open File / drag). */
export async function applyDesktopFileOpen(payload: DesktopFileOpenPayload): Promise<void> {
    const layout = useLayoutStore()
    const path = payload.path?.trim()
    if (!path) return

    if (path.toLowerCase().endsWith('.dwp') || payload.kind === 'dwp') {
        const workspace = useWorkspaceStore()
        const name = fileBaseName(path)
        const allowUnsigned = readAllowUnsignedPreference()
        const confirmed = await askAppConfirm({
            title: t('communityPlugin.confirmDesktopInstallTitle'),
            message: t('communityPlugin.confirmDesktopInstallMessage', {name}),
            confirmVariant: 'primary',
        })
        if (!confirmed) {
            workspace.openCommunityPluginCenter()
            return
        }
        try {
            const result = await createHttpCommunityPluginsApi().installFromPath(path, allowUnsigned)
            window.dispatchEvent(new CustomEvent('dw-community-plugin-changed'))
            workspace.openCommunityPluginCenter({selectPluginId: result.plugin.manifest.id})
            layout.notifyQuiet({
              category: 'system',
              titleKey: 'installDone',
              bodyKey: 'installDone',
              params: {detail: t('communityPlugin.installedToast')},
            })
        } catch (error) {
            workspace.openCommunityPluginCenter()
            layout.showErrorToast(
                resolveCaughtApiErrorMessage(error, t, 'communityPlugin.installFailed'),
            )
        }
        return
    }

    const isSql = payload.kind === 'sql' || isLocalSqlFileName(path)
    const isText = isSql || isLocalTextFileName(path) || payload.kind === 'file'
    if (!isText && !isSql) {
        layout.showErrorToast(t('app.desktopHost.unsupportedFile'))
        return
    }

    // Prefer the local-files open path (registers tree sync + text tabs).
    if (isLocalTextFileName(path) || isSql) {
        await openLocalWorkspaceFile(path)
        return
    }

    layout.showErrorToast(t('app.desktopHost.unsupportedFile'))
}

/** Open SQL from a browser File (HTML5 drop into CEF / web). */
export async function openSqlFromBrowserFile(file: File): Promise<void> {
    const layout = useLayoutStore()
    const workspace = useWorkspaceStore()
    const name = (file?.name || '').trim() || 'dropped.sql'
    if (!isLocalSqlFileName(name)) {
        layout.showErrorToast(t('app.desktopHost.unsupportedFile'))
        return
    }
    layout.setModule('database')
    try {
        const content = await file.text()
        await workspace.openConsole({
            sql: content,
            title: name,
            skipEnsureScriptFile: true,
        })
    } catch {
        layout.showErrorToast(t('app.desktopHost.openFailed'))
    }
}

/** Open SQL console or local text preview from an HTML5-dropped File. */
export async function openDroppedBrowserFile(file: File): Promise<void> {
    const layout = useLayoutStore()
    const workspace = useWorkspaceStore()
    const name = (file?.name || '').trim() || 'dropped.txt'
    if (isLocalSqlFileName(name)) {
        await openSqlFromBrowserFile(file)
        return
    }
    if (!isLocalTextFileName(name)) {
        layout.showErrorToast(t('app.desktopHost.unsupportedFile'))
        return
    }
    layout.setModule('database')
    try {
        const content = await file.text()
        await workspace.openLocalTextTab({
            title: name,
            content,
            path: `dropped://${name}`,
        })
    } catch {
        layout.showErrorToast(t('app.desktopHost.openFailed'))
    }
}

export function isSqlLikeFileName(name: string): boolean {
    return isLocalSqlFileName(name)
}

export function isDroppableWorkspaceFileName(name: string): boolean {
    return isLocalSqlFileName(name) || isLocalTextFileName(name)
}

export async function pickAndOpenSqlFile(): Promise<void> {
    const host = readDatawiseHost()
    const layout = useLayoutStore()
    if (!host?.fs?.selectFile) {
        layout.showErrorToast(t('app.desktopHost.readUnsupported'))
        return
    }
    const path = await host.fs.selectFile('sql')
    if (!path) return
    await applyDesktopFileOpen({path, kind: 'sql'})
}

/** Native file picker → open as local workspace text / SQL tab. */
export async function pickAndOpenLocalWorkspaceFile(ext?: string): Promise<void> {
    const host = readDatawiseHost()
    const layout = useLayoutStore()
    if (!host?.fs?.selectFile) {
        layout.showErrorToast(t('app.desktopHost.readUnsupported'))
        return
    }
    const path = await host.fs.selectFile(ext)
    if (!path) return
    await openLocalWorkspaceFile(path)
}

export async function revealPathInExplorer(path: string): Promise<boolean> {
    const host = readDatawiseHost()
    const layout = useLayoutStore()
    if (!host?.fs?.revealInExplorer || !path) {
        layout.showErrorToast(t('app.desktopHost.revealUnsupported'))
        return false
    }
    try {
        const result = await host.fs.revealInExplorer(path)
        if (!result?.ok) {
            layout.showErrorToast(t('app.desktopHost.revealFailed'))
            return false
        }
        return true
    } catch {
        layout.showErrorToast(t('app.desktopHost.revealFailed'))
        return false
    }
}

export function canPickSqlFile(): boolean {
    return Boolean(readDatawiseHost()?.fs?.selectFile)
}

export function canRevealInExplorer(): boolean {
    return Boolean(readDatawiseHost()?.fs?.revealInExplorer)
}

const ALLOW_UNSIGNED_KEY = 'datawise-community-plugin-allow-unsigned'

function readAllowUnsignedPreference(): boolean {
    try {
        return localStorage.getItem(ALLOW_UNSIGNED_KEY) === 'true'
    } catch {
        return false
    }
}
