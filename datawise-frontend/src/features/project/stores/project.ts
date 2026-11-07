import {defineStore} from 'pinia'
import {computed, ref} from 'vue'
import {projectsApi, type ProjectDto} from '@/features/project/services/project-api'
import {ApiError} from '@/shared/api/http/api-error'
import {touchRecentProject} from '@/features/project/services/project-recent'

const PROJECT_HEADER = 'X-DataWise-Project-Id'
const LS_ACTIVE_KEY = 'dw-cli-active-project-id'

function syntheticDefaultProject(): ProjectDto {
    return {
        id: 'proj_default',
        name: '默认项目',
        archived: false,
        isDefault: true,
        description: null,
        colorKey: null,
    }
}

function isProjectsApiUnavailable(error: unknown): boolean {
    if (!(error instanceof ApiError)) return false
    const msg = error.message.trim()
    if (msg === 'HTTP 404' || msg === 'Not Found' || /404/.test(msg)) return true
    if (error.data && typeof error.data === 'object') {
        const code = (error.data as {errorCode?: unknown; status?: unknown}).errorCode
        if (code === 'NOT_FOUND') return true
    }
    return false
}

/** 应用内 Project 作用域：列表、活动项目、切换（无重启）。 */
export const useProjectStore = defineStore('project', () => {
    const projects = ref<ProjectDto[]>([])
    const activeProjectId = ref<string | null>(readCachedActiveId())
    const ready = ref(false)
    const loading = ref(false)
    const switching = ref(false)
    /** 旧后端无 /api/projects 时降级为单隐式 Default。 */
    const apiUnavailable = ref(false)

    const activeProject = computed(() =>
        projects.value.find((p) => p.id === activeProjectId.value) ?? null,
    )

    const displayName = computed(
        () => activeProject.value?.name ?? '默认项目',
    )

    function readCachedActiveId(): string | null {
        if (typeof localStorage === 'undefined') return null
        return localStorage.getItem(LS_ACTIVE_KEY)
    }

    function cacheActiveId(id: string | null) {
        if (typeof localStorage === 'undefined') return
        if (id) localStorage.setItem(LS_ACTIVE_KEY, id)
        else localStorage.removeItem(LS_ACTIVE_KEY)
    }

    function applyLegacyFallback() {
        const fallback = syntheticDefaultProject()
        projects.value = [fallback]
        activeProjectId.value = fallback.id
        cacheActiveId(fallback.id)
        apiUnavailable.value = true
        ready.value = true
    }

    async function load() {
        loading.value = true
        try {
            const [list, active] = await Promise.all([
                projectsApi.list(false),
                projectsApi.getActive(),
            ])
            projects.value = list
            activeProjectId.value = active.projectId
            cacheActiveId(active.projectId)
            touchRecentProject(active.projectId)
            apiUnavailable.value = false
            ready.value = true
        } catch (error) {
            if (isProjectsApiUnavailable(error)) {
                applyLegacyFallback()
                return
            }
            throw error
        } finally {
            loading.value = false
        }
    }

    function resetForSession() {
        projects.value = []
        activeProjectId.value = null
        ready.value = false
        apiUnavailable.value = false
        cacheActiveId(null)
    }

    async function createProject(
        name: string,
        options?: {switchTo?: boolean; templateId?: string; defaultEnv?: string},
    ) {
        if (apiUnavailable.value) {
            throw new ApiError('PROJECTS_API_UNAVAILABLE')
        }
        const created = await projectsApi.create({
            name: name.trim(),
            templateId: options?.templateId,
            defaultEnv: options?.defaultEnv,
        })
        projects.value = [created, ...projects.value.filter((p) => p.id !== created.id)]
        if (options?.switchTo !== false) {
            await switchProject(created.id)
        }
        return created
    }

    async function deleteProject(
        projectId: string,
        options?: {mode?: 'empty-only' | 'move-to-default' | 'purge'; confirmPurgeConnections?: boolean},
    ) {
        if (apiUnavailable.value) {
            throw new ApiError('PROJECTS_API_UNAVAILABLE')
        }
        await projectsApi.remove(projectId, options)
        projects.value = projects.value.filter((p) => p.id !== projectId)
        if (activeProjectId.value === projectId) {
            const active = await projectsApi.getActive()
            activeProjectId.value = active.projectId
            cacheActiveId(active.projectId)
            touchRecentProject(active.projectId)
            const idx = projects.value.findIndex((p) => p.id === active.projectId)
            if (idx >= 0) projects.value[idx] = active.project
            else projects.value.unshift(active.project)
        }
    }

    async function updateProject(
        projectId: string,
        body: {
            name?: string
            colorKey?: string
            description?: string
            archived?: boolean
            defaultEnv?: string | null
        },
    ) {
        if (apiUnavailable.value) {
            throw new ApiError('PROJECTS_API_UNAVAILABLE')
        }
        const updated = await projectsApi.update(projectId, body)
        const idx = projects.value.findIndex((p) => p.id === projectId)
        if (idx >= 0) projects.value[idx] = updated
        else projects.value.unshift(updated)
        return updated
    }

    async function moveConnections(
        sourceProjectId: string,
        connectionIds: string[],
        targetProjectId: string,
    ) {
        if (apiUnavailable.value) {
            throw new ApiError('PROJECTS_API_UNAVAILABLE')
        }
        return projectsApi.moveConnections(sourceProjectId, {connectionIds, targetProjectId})
    }

    async function shareConnections(
        sourceProjectId: string,
        connectionIds: string[],
        targetProjectIds: string[],
    ) {
        if (apiUnavailable.value) {
            throw new ApiError('PROJECTS_API_UNAVAILABLE')
        }
        return projectsApi.shareConnections(sourceProjectId, {connectionIds, targetProjectIds})
    }

    async function importProject(file: File, name?: string) {
        if (apiUnavailable.value) {
            throw new ApiError('PROJECTS_API_UNAVAILABLE')
        }
        const created = await projectsApi.importPackage(file, name)
        projects.value = [created, ...projects.value.filter((p) => p.id !== created.id)]
        return created
    }

    async function switchProject(projectId: string) {
        if (!projectId || projectId === activeProjectId.value) return activeProject.value
        if (apiUnavailable.value) {
            throw new ApiError('PROJECTS_API_UNAVAILABLE')
        }
        switching.value = true
        try {
            const active = await projectsApi.setActive(projectId)
            activeProjectId.value = active.projectId
            cacheActiveId(active.projectId)
            touchRecentProject(active.projectId)
            const idx = projects.value.findIndex((p) => p.id === active.projectId)
            if (idx >= 0) projects.value[idx] = active.project
            else projects.value.unshift(active.project)
            return active.project
        } finally {
            switching.value = false
        }
    }

    /** 供 HTTP 层合并请求头。 */
    function projectHeaders(): Record<string, string> {
        const id = activeProjectId.value
        return id ? {[PROJECT_HEADER]: id} : {}
    }

    return {
        projects,
        activeProjectId,
        activeProject,
        displayName,
        ready,
        loading,
        switching,
        apiUnavailable,
        load,
        resetForSession,
        createProject,
        deleteProject,
        updateProject,
        moveConnections,
        shareConnections,
        importProject,
        switchProject,
        projectHeaders,
    }
})
