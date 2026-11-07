import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {
    applyConfigDirectoryAndRestart,
    loadConfigDirSettings,
    pickConfigDirectory,
    prepareNewWorkspace,
    removeRecentWorkspace,
    switchWorkspaceAndRestart,
    type WorkspaceListEntry,
} from '@/features/settings/services/config-dir-settings.service'
import {
    resolveWorkspaceAccent,
    resolveWorkspaceFolderName,
    resolveWorkspaceInitials,
} from '@/features/layout/services/workspace-display.service'
import {isDesktopApp} from '@/features/layout/services/desktop-chrome'

export interface WorkspaceConfirmRequest {
    title: string
    message: string
    confirmLabel?: string
    action: () => Promise<void>
}

export interface WorkspacePromptRequest {
    title: string
    subtitle?: string
    label: string
    defaultValue: string
    action: (value: string) => Promise<void>
}

const loading = ref(true)
const switching = ref(false)
const resolvedPath = ref('')
const defaultPath = ref('')
const canSwitch = ref(false)
const recentWorkspaces = ref<WorkspaceListEntry[]>([])
const confirmDialog = ref<WorkspaceConfirmRequest | null>(null)
const promptDialog = ref<WorkspacePromptRequest | null>(null)

export function useWorkspaceActions() {
    const {t} = useI18n()
    const layout = useLayoutStore()
    const visible = computed(() => isDesktopApp())

    const confirmRestartLabel = () => t('app.titleBar.workspaceSwitcher.confirmRestart')
    const defaultLabel = () => t('app.titleBar.workspaceSwitcher.default')

    async function refresh() {
        loading.value = true
        try {
            const settings = await loadConfigDirSettings()
            // 标题栏展示“当前实际在用”的目录；无健康检查结果时回落偏好解析路径
            resolvedPath.value = settings.activeFromBackend || settings.resolved
            defaultPath.value = settings.defaultPath
            canSwitch.value = settings.canChange
            recentWorkspaces.value = settings.recentWorkspaces
        } finally {
            loading.value = false
        }
    }

    onMounted(() => {
        void refresh()
    })

    function activeEntry(): WorkspaceListEntry | null {
        const fromList = recentWorkspaces.value.find((entry) => entry.active)
        if (fromList) return fromList
        if (!resolvedPath.value) return null
        return {
            path: resolvedPath.value,
            active: true,
            isDefault: resolvedPath.value === defaultPath.value,
        }
    }

    function displayName(entry: WorkspaceListEntry): string {
        return resolveWorkspaceFolderName(entry.path, defaultLabel(), entry.isDefault)
    }

    function displayInitials(entry: WorkspaceListEntry): string {
        return resolveWorkspaceInitials(displayName(entry))
    }

    function displayAccent(entry: WorkspaceListEntry) {
        return resolveWorkspaceAccent(entry.path)
    }

    function recentOthers(): WorkspaceListEntry[] {
        return recentWorkspaces.value.filter((entry) => !entry.active)
    }

    function closeConfirmDialog() {
        confirmDialog.value = null
    }

    function closePromptDialog() {
        promptDialog.value = null
    }

    async function runRestartAction(action: () => Promise<boolean>) {
        switching.value = true
        try {
            const ok = await action()
            if (!ok) {
                layout.showErrorToast(t('app.titleBar.workspaceSwitcher.switchFailed'))
                switching.value = false
            }
        } catch {
            layout.showErrorToast(t('app.titleBar.workspaceSwitcher.switchFailed'))
            switching.value = false
        }
    }

    async function handleConfirmDialog() {
        const request = confirmDialog.value
        if (!request || switching.value) return
        closeConfirmDialog()
        await request.action()
    }

    async function handlePromptDialog(value: string) {
        const request = promptDialog.value
        if (!request || switching.value) return
        closePromptDialog()
        await request.action(value)
    }

    function confirmSwitch(entry: WorkspaceListEntry) {
        if (entry.active || switching.value) return
        confirmDialog.value = {
            title: t('app.titleBar.workspaceSwitcher.switchTitle'),
            message: t('app.titleBar.workspaceSwitcher.switchConfirm', {name: displayName(entry)}),
            confirmLabel: confirmRestartLabel(),
            action: async () => {
                await runRestartAction(() => switchWorkspaceAndRestart(entry.isDefault ? null : entry.path))
            },
        }
    }

    async function openFolder() {
        if (switching.value) return
        const picked = await pickConfigDirectory()
        if (!picked) return
        confirmDialog.value = {
            title: t('app.titleBar.workspaceSwitcher.openFolder'),
            message: t('app.titleBar.workspaceSwitcher.openConfirm', {path: picked}),
            confirmLabel: confirmRestartLabel(),
            action: async () => {
                await runRestartAction(() => applyConfigDirectoryAndRestart(picked))
            },
        }
    }

    function useDefaultWorkspace() {
        const active = activeEntry()
        if (!active || active.isDefault || switching.value) return
        confirmDialog.value = {
            title: t('app.titleBar.workspaceSwitcher.useDefault'),
            message: t('app.titleBar.workspaceSwitcher.defaultConfirm'),
            confirmLabel: confirmRestartLabel(),
            action: async () => {
                await runRestartAction(() => applyConfigDirectoryAndRestart(null))
            },
        }
    }

    function suggestNewWorkspaceName(): string {
        const now = new Date()
        const stamp = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
        ].join('')
        return `workspace-${stamp}`
    }

    function createWorkspace() {
        if (switching.value) return
        promptDialog.value = {
            title: t('app.titleBar.workspaceSwitcher.newWorkspace'),
            subtitle: t('app.titleBar.workspaceSwitcher.newNamePrompt'),
            label: t('app.titleBar.workspaceSwitcher.newNameLabel'),
            defaultValue: suggestNewWorkspaceName(),
            action: async (name) => {
                const result = await prepareNewWorkspace(name)
                if (!result) {
                    layout.showErrorToast(t('app.titleBar.workspaceSwitcher.switchFailed'))
                    return
                }
                if (!result.ok) {
                    layout.showErrorToast(t(`app.titleBar.workspaceSwitcher.newErrors.${result.error}`))
                    return
                }
                confirmDialog.value = {
                    title: t('app.titleBar.workspaceSwitcher.newWorkspace'),
                    message: t('app.titleBar.workspaceSwitcher.newConfirm', {path: result.path}),
                    confirmLabel: confirmRestartLabel(),
                    action: async () => {
                        await runRestartAction(() => applyConfigDirectoryAndRestart(result.path))
                    },
                }
            },
        }
    }

    async function dismissRecent(entry: WorkspaceListEntry) {
        if (entry.active) return
        recentWorkspaces.value = await removeRecentWorkspace(entry.path)
    }

    return {
        visible,
        loading,
        switching,
        canSwitch,
        resolvedPath,
        defaultPath,
        recentWorkspaces,
        confirmDialog,
        promptDialog,
        activeEntry,
        recentOthers,
        displayName,
        displayInitials,
        displayAccent,
        refresh,
        confirmSwitch,
        openFolder,
        createWorkspace,
        useDefaultWorkspace,
        dismissRecent,
        closeConfirmDialog,
        closePromptDialog,
        handleConfirmDialog,
        handlePromptDialog,
    }
}
