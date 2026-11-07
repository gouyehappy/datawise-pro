import {getCurrentInstance, type App} from 'vue'

const HOST_STATE_KEY = '__datawiseSqlEditorPluginHost__'

type HostState = {
    app: App
    installed: boolean
}

type GlobalWithHost = typeof globalThis & {
    [HOST_STATE_KEY]?: HostState
}

let installPromise: Promise<void> | null = null

function readHostState(): HostState | null {
    return (globalThis as GlobalWithHost)[HOST_STATE_KEY] ?? null
}

function writeHostState(state: HostState): void {
    ;(globalThis as GlobalWithHost)[HOST_STATE_KEY] = state
}

/** 在 main.ts 挂载前注册，供延迟安装 SqlEditor 插件使用（经 globalThis，避免 HMR 丢引用） */
export function registerSqlEditorApp(app: App): void {
    const prev = readHostState()
    writeHostState({
        app,
        // 同一 app 实例上已装过则保留；换 app（极少）则重装
        installed: prev?.app === app ? prev.installed : false,
    })
}

/**
 * 解析宿主 App：优先 registerSqlEditorApp；组件生命周期内可回退当前实例。
 * 必须在任何 await 之前同步调用（getCurrentInstance 在 await 后无效）。
 */
function resolveHostApp(): App | null {
    return readHostState()?.app
        ?? getCurrentInstance()?.appContext.app
        ?? null
}

/** 首次打开 SQL 编辑器或相关设置时再加载 Monaco Worker 与插件，缩短冷启动 */
export function ensureSqlEditorPlugin(): Promise<void> {
    if (readHostState()?.installed) return Promise.resolve()

    // 同步解析：避免 async 导入后再 getCurrentInstance 得到 null，也避免无 app 的 in-flight promise 拖死后续调用
    const app = resolveHostApp()
    if (!app) {
        return Promise.reject(new Error('SqlEditor plugin host app is not registered'))
    }
    if (!readHostState()?.app) {
        writeHostState({app, installed: false})
    }

    if (!installPromise) {
        installPromise = (async () => {
            await import('@/monaco-desktop-workers')
            const [
                {installSqlEditorPlugin, getDefaultSqlEditorRuntime, SQL_EDITOR_SHORTCUTS_CONTROLLER_KEY},
                {useDatawiseSqlEditorHost},
                {getAppSqlEditorShortcutsController},
            ] = await Promise.all([
                import('@datawise/sql-editor'),
                import('@/features/workspace/adapters/datawise-sql-editor-host'),
                import('@/features/settings/services/sql-editor-shortcuts.controller'),
            ])
            const host = readHostState()?.app
            if (!host) {
                throw new Error('SqlEditor plugin host app is not registered')
            }
            // 复用 app-config 启动时已绑定的 runtime，避免片段/设置与编辑器不同步
            installSqlEditorPlugin(host, {
                config: useDatawiseSqlEditorHost(),
                runtime: getDefaultSqlEditorRuntime(),
            })
            // 单一写路径：设置页 + 编辑器抽屉共用 App controller → personal LS → runtime.sync → cache
            host.provide(SQL_EDITOR_SHORTCUTS_CONTROLLER_KEY, getAppSqlEditorShortcutsController())
            writeHostState({app: host, installed: true})
        })().catch((error) => {
            installPromise = null
            throw error
        })
    }
    return installPromise
}
