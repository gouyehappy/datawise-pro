import type {WorkspaceTabGroupSnapshot, WorkspaceTabSnapshot} from '@/shared/config/app-config.types'

const STORAGE_KEY = 'dw-cli-project-workbench-sessions'

export type ProjectWorkbenchSession = {
    tabs: WorkspaceTabSnapshot[]
    activeTabIndex: number
    tabGroups?: WorkspaceTabGroupSnapshot[]
}

type SessionMap = Record<string, ProjectWorkbenchSession>

function readMap(): SessionMap {
    if (typeof localStorage === 'undefined') return {}
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw) as SessionMap
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

function writeMap(map: SessionMap) {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function saveProjectWorkbenchSession(projectId: string, session: ProjectWorkbenchSession) {
    const id = projectId?.trim()
    if (!id) return
    const map = readMap()
    map[id] = {
        tabs: Array.isArray(session.tabs) ? session.tabs : [],
        activeTabIndex: Number.isFinite(session.activeTabIndex) ? session.activeTabIndex : 0,
        tabGroups: Array.isArray(session.tabGroups) ? session.tabGroups : [],
    }
    writeMap(map)
}

export function loadProjectWorkbenchSession(projectId: string): ProjectWorkbenchSession | null {
    const id = projectId?.trim()
    if (!id) return null
    const entry = readMap()[id]
    if (!entry || !Array.isArray(entry.tabs) || entry.tabs.length === 0) return null
    return {
        tabs: entry.tabs,
        activeTabIndex: Number.isFinite(entry.activeTabIndex) ? entry.activeTabIndex : 0,
        tabGroups: Array.isArray(entry.tabGroups) ? entry.tabGroups : [],
    }
}

export function clearProjectWorkbenchSession(projectId: string) {
    const id = projectId?.trim()
    if (!id) return
    const map = readMap()
    if (!(id in map)) return
    delete map[id]
    writeMap(map)
}
