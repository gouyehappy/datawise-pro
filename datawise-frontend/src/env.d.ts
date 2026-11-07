/// <reference types="vite/client" />

declare module '*.json' {
    const value: unknown
    export default value
}

declare module '*.svg?raw' {
    const content: string
    export default content
}

import type {WindowPreferences} from '@/shared/config/app-config.types'
import type {DeepLinkOpenPayload} from '@/shared/deep-link/deep-link.types'
import type {NativeTerminalBridge} from '@/features/terminal/services/native-terminal.types'
import type {PluginHookHandlers} from '@/features/plugin/types/plugin-hook.types'

interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string
    /** `standard` = paid UI stubs (AI / migration / backup); default/full keeps full workbench */
    readonly VITE_DATAWISE_EDITION?: 'standard' | 'full' | string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

declare global {
    interface Window {
        /** JCEF / desktop host 注入的只读桥；勿直接覆盖 */
        __datawiseDesktopBridge?: Omit<
            NonNullable<Window['datawise']>,
            'registerPluginHooks' | 'unregisterPluginHooks'
        >
        datawise?: {
            platform: string
            apiBaseUrl?: string
            appVersion?: string
            isPackaged?: boolean
            window?: {
                getState: () => Promise<WindowPreferences | null>
                setState: (state: WindowPreferences) => Promise<boolean>
                onStateChange: (callback: (state: WindowPreferences) => void) => () => void
            }
            terminal?: NativeTerminalBridge
            chrome?: {
                minimize: () => Promise<boolean>
                toggleMaximize: () => Promise<boolean>
                close: () => Promise<boolean>
                isMaximized: () => Promise<boolean>
                onMaximizeChange: (callback: (maximized: boolean) => void) => () => void
                /** JCEF frameless chrome drag */
                startDrag?: (screenX: number, screenY: number) => Promise<boolean>
                dragTo?: (screenX: number, screenY: number) => Promise<boolean>
                endDrag?: () => Promise<boolean>
            }
            updater?: {
                checkForUpdates: () => Promise<{
                    currentVersion: string
                    latestVersion: string
                    hasUpdate: boolean
                    downloadReady?: boolean
                    downloading?: boolean
                    error?: string
                }>
                downloadUpdate: () => Promise<{
                    currentVersion: string
                    latestVersion: string
                    hasUpdate: boolean
                    downloadReady?: boolean
                    downloading?: boolean
                    error?: string
                }>
                quitAndInstall: () => Promise<boolean>
                setPreferences: (prefs: {
                    notifyOnUpdate: boolean
                    autoDownload: boolean
                }) => Promise<boolean>
                getStatus: () => Promise<{
                    currentVersion: string
                    latestVersion: string
                    hasUpdate: boolean
                    downloadReady?: boolean
                    downloading?: boolean
                    error?: string
                }>
                onStatus: (callback: (event: {
                    phase: 'available' | 'downloading' | 'downloaded' | 'error' | 'not-available'
                    currentVersion: string
                    latestVersion: string
                    percent?: number
                    error?: string
                }) => void) => () => void
            }
            config?: {
                getSettings: () => Promise<{
                    configured: string | null
                    resolved: string
                    defaultPath: string
                    canChange: boolean
                    recentWorkspaces: Array<{
                        path: string
                        active: boolean
                        isDefault: boolean
                    }>
                    runtimeSetupPending?: boolean
                    jre?: {
                        source: 'bundled' | 'system' | 'custom'
                        customHome?: string | null
                    }
                }>
                pickDirectory: () => Promise<string | null>
                applyAndRestart: (configDir: string | null) => Promise<boolean>
                switchWorkspace: (resolvedPath: string | null) => Promise<boolean>
                removeRecentWorkspace: (resolvedPath: string) => Promise<Array<{
                    path: string
                    active: boolean
                    isDefault: boolean
                }>>
                createWorkspace: (name: string) => Promise<{
                    ok: true
                    path: string
                } | {
                    ok: false
                    error: 'invalid' | 'exists'
                }>
                resolvePath: (configured: string) => Promise<string>
                clearRuntimeSetupPending?: () => Promise<boolean>
                getJrePreferences?: () => Promise<{
                    source: 'bundled' | 'system' | 'custom'
                    customHome?: string | null
                }>
                setJrePreferences?: (prefs: {
                    source?: 'bundled' | 'system' | 'custom'
                    customHome?: string | null
                }) => Promise<{
                    source: 'bundled' | 'system' | 'custom'
                    customHome?: string | null
                }>
            }
            deepLink?: {
                flushPending: () => Promise<DeepLinkOpenPayload | null>
                onOpen: (callback: (payload: DeepLinkOpenPayload) => void) => () => void
            }
            logs?: {
                openRuntime: () => Promise<{
                    ok: boolean
                    path?: string
                    error?: 'missing' | 'open_failed'
                }>
            }
            devtools?: {
                toggle: () => Promise<boolean>
            }
            fs?: {
                selectFile: (ext?: string) => Promise<string | null>
                selectSaveFile?: (suggestedName?: string, ext?: string) => Promise<string | null>
                writeBinaryFile?: (path: string, base64: string) => Promise<{ok: boolean; path?: string; error?: string}>
                selectDirectory: () => Promise<string | null>
                registerRoot?: (path: string) => Promise<{ok: boolean; path?: string; error?: string}>
                revealInExplorer: (path: string) => Promise<{ok: boolean; error?: string}>
                readTextFile: (path: string) => Promise<{ok: boolean; path?: string; content?: string; error?: string}>
                readFileDataUrl?: (path: string) => Promise<{ok: boolean; path?: string; dataUrl?: string; error?: string}>
                gitStatus?: (path: string) => Promise<{
                    ok: boolean
                    insideRepo?: boolean
                    repoRoot?: string
                    entries?: Array<{path: string; xy: string}>
                    error?: string
                }>
                gitDiff?: (path: string) => Promise<{
                    ok: boolean
                    insideRepo?: boolean
                    untracked?: boolean
                    diff?: string
                    error?: string
                }>
                writeTextFile?: (path: string, content: string) => Promise<{ok: boolean; path?: string; error?: string}>
                listDir?: (path: string, includeHidden?: boolean) => Promise<{
                    ok: boolean
                    path?: string
                    entries?: Array<{
                        name: string
                        path: string
                        isDirectory: boolean
                        size: number
                        mtimeMs: number
                    }>
                    error?: string
                }>
                stat?: (path: string) => Promise<{
                    ok: boolean
                    stat?: {
                        exists: boolean
                        path?: string
                        isDirectory?: boolean
                        size?: number
                        mtimeMs?: number
                    }
                    error?: string
                }>
                mkdir?: (path: string) => Promise<{ok: boolean; path?: string; error?: string}>
                rename?: (from: string, to: string) => Promise<{ok: boolean; path?: string; error?: string}>
                delete?: (path: string, recursive?: boolean) => Promise<{ok: boolean; error?: string}>
                openInTerminal?: (path: string) => Promise<{ok: boolean; error?: string}>
                onOpen: (callback: (payload: {path: string; kind: string}) => void) => () => void
            }
            browser?: {
                setZoomLevel: (level: number) => Promise<boolean>
                getZoomLevel: () => Promise<number>
            }
            clipboard?: {
                readText: () => Promise<string>
                writeText?: (text: string) => Promise<boolean | void>
            }
            shell?: {
                openExternal: (url: string) => Promise<boolean>
                /** Sync CEF popup policy: 'builtin' | 'system' */
                setOpenHttpLinksIn?: (mode: string) => Promise<boolean>
            }
            theme?: {
                getSystemAppearance: () => Promise<{appearance: string}>
                onSystemChange: (callback: (payload: {
                    appearance: string
                    resolvedMode?: string
                    chromeBg?: string
                }) => void) => () => void
            }
            backend?: {
                getStartupState: () => Promise<{
                    phase: string
                    progress: number
                }>
                onStartupProgress: (callback: (event: {
                    phase: string
                    progress: number
                }) => void) => () => void
            }
            splash?: {
                notifyReady: () => void
                notifyBarPainted: (progress: number) => void
                waitBarComplete: (progress?: number) => Promise<boolean>
                reportProgress: (payload: { progress: number; status: string }) => void
                onProgress: (callback: (payload: { progress: number; status?: string }) => void) => () => void
                getMeta: () => { version: string; tagline: string; isPackaged: boolean }
            }
            /** JCEF host file-backed UI keys (session / onboarding) */
            uiStore?: {
                persist: (patch: Record<string, string | null | undefined>) => Promise<boolean>
                clearSession: () => Promise<boolean>
            }
            registerPluginHooks?: (pluginId: string, handlers: PluginHookHandlers) => void
            unregisterPluginHooks?: (pluginId: string) => void
        }
    }
}

export {}
