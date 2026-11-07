import type {ContextMenuItem} from '@/core/types'
import type {ProjectDto} from '@/features/project/services/project-api'

export const MOVE_TO_PROJECT_MENU_PREFIX = 'move-to-project:'
export const SHARE_TO_PROJECT_MENU_PREFIX = 'share-to-project:'

export function toMoveToProjectMenuId(projectId: string): string {
    return `${MOVE_TO_PROJECT_MENU_PREFIX}${projectId}`
}

export function parseMoveToProjectMenuId(menuId: string): string | null {
    if (!menuId.startsWith(MOVE_TO_PROJECT_MENU_PREFIX)) return null
    const id = menuId.slice(MOVE_TO_PROJECT_MENU_PREFIX.length)
    return id || null
}

export function toShareToProjectMenuId(projectId: string): string {
    return `${SHARE_TO_PROJECT_MENU_PREFIX}${projectId}`
}

export function parseShareToProjectMenuId(menuId: string): string | null {
    if (!menuId.startsWith(SHARE_TO_PROJECT_MENU_PREFIX)) return null
    const id = menuId.slice(SHARE_TO_PROJECT_MENU_PREFIX.length)
    return id || null
}

export function listOtherProjects(
    projects: ProjectDto[],
    excludeProjectId: string | null | undefined,
): ProjectDto[] {
    const exclude = excludeProjectId?.trim() || ''
    return projects
        .filter((p) => !p.archived && p.id !== exclude)
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, {sensitivity: 'base'}))
}

export function injectProjectConnectionSubmenus(
    items: ContextMenuItem[],
    targets: ProjectDto[],
    labels: {moveToProject: string; shareToProject: string},
): ContextMenuItem[] {
    const moveChildren = targets.map((p) => ({
        id: toMoveToProjectMenuId(p.id),
        label: p.name,
        icon: 'file' as const,
    }))
    const shareChildren = targets.map((p) => ({
        id: toShareToProjectMenuId(p.id),
        label: p.name,
        icon: 'file' as const,
    }))
    const extras: ContextMenuItem[] = [
        targets.length
            ? {id: 'move-to-project', label: labels.moveToProject, icon: 'file', children: moveChildren}
            : {id: 'move-to-project', label: labels.moveToProject, icon: 'file', disabled: true},
        targets.length
            ? {id: 'share-to-project', label: labels.shareToProject, icon: 'file', children: shareChildren}
            : {id: 'share-to-project', label: labels.shareToProject, icon: 'file', disabled: true},
    ]
    const moveIndex = items.findIndex((item) => item.id === 'move')
    if (moveIndex < 0) return [...items, ...extras]
    const next = [...items]
    next.splice(moveIndex + 1, 0, ...extras)
    return next
}
