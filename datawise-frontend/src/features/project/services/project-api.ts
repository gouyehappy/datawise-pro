import {API_PATHS} from '@/shared/api/http/paths'
import type {
    ActiveProjectDto as WireActiveProjectDto,
    CreateProjectRequest,
    ProjectDto as WireProjectDto,
    UpdateProjectRequest,
} from '@/shared/api/generated'
import {
    deleteJson,
    downloadAttachment,
    getJson,
    postJson,
    postMultipart,
    putJson,
} from '@/shared/api/http/request'

/** Domain project shape (stricter than OpenAPI optionals; includes host-only fields). */
export type ProjectDto = {
    id: string
    name: string
    colorKey?: string | null
    description?: string | null
    createdAt?: string | null
    updatedAt?: string | null
    archived: boolean
    docsDir?: string | null
    scriptsDir?: string | null
    isDefault: boolean
    defaultEnv?: string | null
    templateId?: string | null
}

export type ActiveProjectDto = {
    projectId: string
    project: ProjectDto
}

export type ProjectTemplateId = 'blank' | 'ecommerce' | 'data-platform'

function mapProject(wire: WireProjectDto & {
    defaultEnv?: string | null
    templateId?: string | null
}): ProjectDto {
    return {
        id: String(wire.id ?? ''),
        name: String(wire.name ?? ''),
        colorKey: wire.colorKey ?? null,
        description: wire.description ?? null,
        createdAt: wire.createdAt ?? null,
        updatedAt: wire.updatedAt ?? null,
        archived: Boolean(wire.archived),
        docsDir: wire.docsDir ?? null,
        scriptsDir: wire.scriptsDir ?? null,
        isDefault: Boolean(wire.isDefault),
        defaultEnv: wire.defaultEnv ?? null,
        templateId: wire.templateId ?? null,
    }
}

function mapActive(wire: WireActiveProjectDto): ActiveProjectDto {
    return {
        projectId: String(wire.projectId ?? wire.project?.id ?? ''),
        project: mapProject(wire.project ?? {}),
    }
}

/**
 * Projects HTTP client — list/create/update wire types from OpenAPI;
 * maps to domain {@link ProjectDto} for store/UI consumers.
 */
export const projectsApi = {
    list: async (includeArchived = false) => {
        const list = await getJson<WireProjectDto[]>(API_PATHS.projects.list, {
            includeArchived: includeArchived ? 'true' : undefined,
        }, {silent: true})
        return (list ?? []).map(mapProject)
    },
    create: async (body: {
        name: string
        colorKey?: string
        description?: string
        templateId?: ProjectTemplateId | string
        defaultEnv?: string
    }) => {
        const request: CreateProjectRequest & {
            templateId?: string
            defaultEnv?: string
        } = {
            name: body.name,
            colorKey: body.colorKey,
            description: body.description,
            templateId: body.templateId,
            defaultEnv: body.defaultEnv,
        }
        const created = await postJson<WireProjectDto>(API_PATHS.projects.create, request)
        return mapProject(created)
    },
    getActive: async () => mapActive(await getJson<WireActiveProjectDto>(
        API_PATHS.projects.active,
        undefined,
        {silent: true},
    )),
    setActive: async (projectId: string) =>
        mapActive(await putJson<WireActiveProjectDto>(API_PATHS.projects.active, {projectId})),
    update: async (
        projectId: string,
        body: {
            name?: string
            colorKey?: string
            description?: string
            archived?: boolean
            defaultEnv?: string | null
            templateId?: string | null
        },
    ) => {
        const request: UpdateProjectRequest & {
            archived?: boolean
            defaultEnv?: string | null
            templateId?: string | null
        } = body
        const updated = await putJson<WireProjectDto>(API_PATHS.projects.one(projectId), request)
        return mapProject(updated)
    },
    remove: (
        projectId: string,
        options?: {mode?: 'empty-only' | 'move-to-default' | 'purge'; confirmPurgeConnections?: boolean},
    ) => {
        const params = new URLSearchParams()
        params.set('mode', options?.mode ?? 'empty-only')
        if (options?.confirmPurgeConnections) {
            params.set('confirmPurgeConnections', 'true')
        }
        const qs = params.toString()
        return deleteJson<void>(`${API_PATHS.projects.one(projectId)}?${qs}`)
    },
    moveConnections: (
        projectId: string,
        body: {connectionIds: string[]; targetProjectId: string},
    ) => postJson<{moved: number}>(API_PATHS.projects.moveConnections(projectId), body),
    shareConnections: (
        projectId: string,
        body: {connectionIds: string[]; targetProjectIds: string[]},
    ) => postJson<{updated: number}>(API_PATHS.projects.shareConnections(projectId), body),
    exportPackage: (projectId: string) =>
        downloadAttachment(API_PATHS.projects.export(projectId)),
    importPackage: async (file: File, name?: string) => {
        const form = new FormData()
        form.append('file', file)
        if (name?.trim()) form.append('name', name.trim())
        const created = await postMultipart<WireProjectDto>(API_PATHS.projects.import, form)
        return mapProject(created)
    },
}
