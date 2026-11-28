/** Persist list prefs (column widths, sort, filter, auto-refresh) across sessions. */

export type ResourceKind = 'containers' | 'images' | 'volumes' | 'networks'
export type ContainerFilter = 'all' | 'running' | 'stopped'
export type SortDirection = 'asc' | 'desc'

export interface ResourceSort {
  key: string
  direction: SortDirection
}

export interface WorkbenchPrefs {
  columnWidths?: Partial<Record<ResourceKind, number[]>>
  sortByResource?: Partial<Record<ResourceKind, ResourceSort>>
  filter?: ContainerFilter
  autoRefresh?: boolean
}

const STORAGE_KEY = 'dw.docker.workbench.v1'

export const DEFAULT_COLUMN_WIDTHS: Record<ResourceKind, number[]> = {
  // checkbox + name/id/image/ports/cpu/mem/status/actions
  containers: [36, 220, 110, 180, 140, 80, 150, 95, 250],
  images: [280, 140, 110, 180, 260],
  volumes: [220, 140, 140, 380],
  networks: [220, 150, 120, 120, 100, 100],
}

export const DEFAULT_SORT: ResourceSort = { key: 'name', direction: 'asc' }

function migrateContainerWidths(widths: number[]): number[] {
  const expected = DEFAULT_COLUMN_WIDTHS.containers.length
  if (widths.length === expected) return widths
  // Pre-0.1.3 layouts lacked the checkbox column.
  if (widths.length === expected - 1) return [DEFAULT_COLUMN_WIDTHS.containers[0], ...widths]
  return DEFAULT_COLUMN_WIDTHS.containers.slice()
}

export function loadWorkbenchPrefs(): WorkbenchPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as WorkbenchPrefs
    if (parsed.columnWidths?.containers) {
      parsed.columnWidths.containers = migrateContainerWidths(parsed.columnWidths.containers)
    }
    return parsed
  } catch {
    return {}
  }
}

export function saveWorkbenchPrefs(patch: WorkbenchPrefs): void {
  try {
    const current = loadWorkbenchPrefs()
    const next: WorkbenchPrefs = {
      ...current,
      ...patch,
      columnWidths: { ...current.columnWidths, ...patch.columnWidths },
      sortByResource: { ...current.sortByResource, ...patch.sortByResource },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota / private mode */
  }
}

export function resolveColumnWidths(prefs: WorkbenchPrefs): Record<ResourceKind, number[]> {
  return {
    containers: prefs.columnWidths?.containers?.length
      ? migrateContainerWidths(prefs.columnWidths.containers)
      : DEFAULT_COLUMN_WIDTHS.containers.slice(),
    images: prefs.columnWidths?.images?.length
      ? prefs.columnWidths.images.slice()
      : DEFAULT_COLUMN_WIDTHS.images.slice(),
    volumes: prefs.columnWidths?.volumes?.length
      ? prefs.columnWidths.volumes.slice()
      : DEFAULT_COLUMN_WIDTHS.volumes.slice(),
    networks: prefs.columnWidths?.networks?.length
      ? prefs.columnWidths.networks.slice()
      : DEFAULT_COLUMN_WIDTHS.networks.slice(),
  }
}
