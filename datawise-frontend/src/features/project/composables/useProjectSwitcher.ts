import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useProjectStore} from '@/features/project/stores/project'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {ApiError} from '@/shared/api/http/api-error'
import type {ProjectDto} from '@/features/project/services/project-api'
import {
    loadProjectWorkbenchSession,
    saveProjectWorkbenchSession,
} from '@/features/project/services/project-workbench-session'
import {
    listRecentProjectIds,
    removeRecentProject,
    touchRecentProject,
} from '@/features/project/services/project-recent'

export type ProjectSwitchDirtyGuard = () => Promise<boolean>

/** JetBrains New UI 风格色块（饱和、偏暖，避免全 slate）。 */
const COLOR_MAP: Record<string, {bg: string; fg: string}> = {
    orange: {bg: '#E35205', fg: '#fff'},
    coral: {bg: '#F26522', fg: '#fff'},
    pink: {bg: '#EC407A', fg: '#fff'},
    purple: {bg: '#9575CD', fg: '#fff'},
    indigo: {bg: '#5C6BC0', fg: '#fff'},
    blue: {bg: '#42A5F5', fg: '#fff'},
    teal: {bg: '#26A69A', fg: '#fff'},
    green: {bg: '#66BB6A', fg: '#1b1b1b'},
    amber: {bg: '#FFA726', fg: '#1b1b1b'},
    slate: {bg: '#78909C', fg: '#fff'},
}

const COLOR_KEYS = Object.keys(COLOR_MAP).filter((k) => k !== 'slate')

function hashColorKey(seed: string): string {
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) | 0
    }
    return COLOR_KEYS[Math.abs(hash) % COLOR_KEYS.length] ?? 'orange'
}

function projectErrorCode(error: unknown): string | null {
    if (!(error instanceof ApiError)) return null
    const raw = error.message.trim()
    if (raw.startsWith('PROJECT_')) return raw
    if (error.data && typeof error.data === 'object') {
        const code = (error.data as {errorCode?: unknown}).errorCode
        if (typeof code === 'string' && code.startsWith('PROJECT_')) return code
    }
    return null
}

export function useProjectSwitcher() {
    const {t} = useI18n()
    const projectStore = useProjectStore()
    const layout = useLayoutStore()
    const creating = ref(false)
    const deleting = ref(false)
    const recentEpoch = ref(0)

    const projects = computed(() => projectStore.projects)
    const activeProject = computed(() => projectStore.activeProject)
    const loading = computed(() => projectStore.loading)
    const switching = computed(() => projectStore.switching)
    const ready = computed(() => projectStore.ready)
    const apiUnavailable = computed(() => projectStore.apiUnavailable)

    const recentProjects = computed(() => {
        recentEpoch.value
        const activeId = activeProject.value?.id
        const byId = new Map(projects.value.map((p) => [p.id, p]))
        const ordered: ProjectDto[] = []
        for (const id of listRecentProjectIds()) {
            if (id === activeId) continue
            const hit = byId.get(id)
            if (hit) ordered.push(hit)
        }
        // 未进 recent 的其余项目按名称补在后面
        const seen = new Set(ordered.map((p) => p.id))
        const rest = projects.value
            .filter((p) => p.id !== activeId && !seen.has(p.id))
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, {sensitivity: 'base'}))
        return [...ordered, ...rest]
    })

    function projectInitials(project: ProjectDto | null | undefined): string {
        const name = project?.name?.trim() || '?'
        // ASCII：两词取首字母，一词取前两字符；CJK：单字徽标更干净（避免「默认」挤爆色块）
        const asciiWords = name.match(/[A-Za-z0-9]+/g)
        if (asciiWords && asciiWords.length >= 2) {
            return (asciiWords[0]![0]! + asciiWords[1]![0]!).toUpperCase()
        }
        if (asciiWords && asciiWords.length === 1) {
            return asciiWords[0]!.slice(0, 2).toUpperCase()
        }
        return name.slice(0, 1)
    }

    function projectAccent(project: ProjectDto | null | undefined): {bg: string; fg: string} {
        if (project?.isDefault) return COLOR_MAP.slate
        const explicit = project?.colorKey?.trim()
        const key = explicit && COLOR_MAP[explicit] ? explicit : hashColorKey(project?.id || project?.name || 'p')
        return COLOR_MAP[key] ?? COLOR_MAP.slate
    }

    function canDeleteProject(project: ProjectDto): boolean {
        return !project.isDefault && project.id !== 'proj_default' && !apiUnavailable.value
    }

    function hasDirtyClosableTabs(): boolean {
        const workspace = useWorkspaceStore()
        return workspace.tabs.some((tab) => tab.closable !== false && workspace.isTabDirty(tab.id))
    }

    async function switchToProject(projectId: string, options?: {confirmDirty?: ProjectSwitchDirtyGuard}) {
        if (!projectId || projectId === projectStore.activeProjectId) return
        if (apiUnavailable.value) {
            layout.showErrorToast(t('app.titleBar.projectSwitcher.apiUnavailable'))
            return
        }
        try {
            const workspace = useWorkspaceStore()
            if (hasDirtyClosableTabs()) {
                const ok = options?.confirmDirty ? await options.confirmDirty() : false
                if (!ok) return
            }
            const fromId = projectStore.activeProjectId
            if (fromId) {
                const snapshot = workspace.captureSession()
                saveProjectWorkbenchSession(fromId, snapshot)
            }
            await projectStore.switchProject(projectId)
            touchRecentProject(projectId)
            recentEpoch.value += 1
            workspace.closeAllClosable()
            const restored = loadProjectWorkbenchSession(projectId)
            if (restored?.tabs.length) {
                workspace.restoreSession(restored.tabs, restored.activeTabIndex, restored.tabGroups ?? [])
            }
            // 切项目：丢掉旧树会话态，避免资源树仍显示上一项目的连接/展开子节点。
            await useExplorerStore().refreshTree({mode: 'project-switch'})
            // 顶栏项目名已变；频繁切换不写通知，避免抽屉被刷屏。
        } catch {
            layout.showErrorToast(t('app.titleBar.projectSwitcher.switchFailed'))
        }
    }

    async function createAndSwitch(
        name: string,
        options?: {confirmDirty?: ProjectSwitchDirtyGuard; templateId?: string; defaultEnv?: string},
    ) {
        if (apiUnavailable.value) {
            layout.showErrorToast(t('app.titleBar.projectSwitcher.apiUnavailable'))
            return
        }
        const trimmed = name.trim()
        if (!trimmed) return
        creating.value = true
        try {
            const workspace = useWorkspaceStore()
            if (hasDirtyClosableTabs()) {
                const ok = options?.confirmDirty ? await options.confirmDirty() : false
                if (!ok) return
            }
            const fromId = projectStore.activeProjectId
            if (fromId) {
                saveProjectWorkbenchSession(fromId, workspace.captureSession())
            }
            await projectStore.createProject(trimmed, {
                switchTo: true,
                templateId: options?.templateId,
                defaultEnv: options?.defaultEnv,
            })
            if (projectStore.activeProjectId) {
                touchRecentProject(projectStore.activeProjectId)
                recentEpoch.value += 1
            }
            workspace.closeAllClosable()
            await useExplorerStore().refreshTree({mode: 'project-switch'})
            layout.notifyQuiet({
                category: 'workspace',
                titleKey: 'projectCreated',
                bodyKey: 'projectCreated',
                params: {name: trimmed},
            })
        } catch {
            layout.showErrorToast(t('app.titleBar.projectSwitcher.createFailed'))
        } finally {
            creating.value = false
        }
    }

    function removeFromRecent(project: ProjectDto) {
        removeRecentProject(project.id)
        recentEpoch.value += 1
    }

    async function deleteProject(project: ProjectDto) {
        if (!canDeleteProject(project)) return
        deleting.value = true
        const wasActive = project.id === projectStore.activeProjectId
        try {
            await projectStore.deleteProject(project.id)
            removeRecentProject(project.id)
            recentEpoch.value += 1
            if (wasActive) {
                const workspace = useWorkspaceStore()
                workspace.closeAllClosable()
                await useExplorerStore().refreshTree({mode: 'project-switch'})
            }
            layout.notifyQuiet({
                category: 'workspace',
                titleKey: 'projectDeleted',
                bodyKey: 'projectDeleted',
                params: {name: project.name},
            })
        } catch (error) {
            const code = projectErrorCode(error)
            if (code === 'PROJECT_NOT_EMPTY') {
                layout.showErrorToast(t('app.titleBar.projectSwitcher.deleteNotEmpty'))
            } else if (code === 'PROJECT_DEFAULT_IMMUTABLE') {
                layout.showErrorToast(t('app.titleBar.projectSwitcher.deleteDefaultBlocked'))
            } else {
                layout.showErrorToast(t('app.titleBar.projectSwitcher.deleteFailed'))
            }
        } finally {
            deleting.value = false
        }
    }

    return {
        projects,
        recentProjects,
        activeProject,
        loading,
        switching,
        creating,
        deleting,
        ready,
        apiUnavailable,
        projectInitials,
        projectAccent,
        canDeleteProject,
        switchToProject,
        createAndSwitch,
        deleteProject,
        removeFromRecent,
        ensureLoaded: () => (projectStore.ready ? Promise.resolve() : projectStore.load()),
    }
}
