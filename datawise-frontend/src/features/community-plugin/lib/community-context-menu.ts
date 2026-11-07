import type {ContextMenuItem} from '@/core/types'
import type {CommunityContributionRef} from '@/features/community-plugin/stores/community-plugin-contributions'

export const COMMUNITY_CONTEXT_MENU_PREFIX = 'community-plugin:context-menu:'

export function communityContextMenuActionId(pluginId: string, contributionId: string): string {
  return `${COMMUNITY_CONTEXT_MENU_PREFIX}${encodeURIComponent(pluginId)}:${encodeURIComponent(contributionId)}`
}

export function parseCommunityContextMenuActionId(
  id: string,
): {pluginId: string; contributionId: string} | null {
  if (!id.startsWith(COMMUNITY_CONTEXT_MENU_PREFIX)) return null
  const rest = id.slice(COMMUNITY_CONTEXT_MENU_PREFIX.length)
  const sep = rest.indexOf(':')
  if (sep <= 0) return null
  try {
    return {
      pluginId: decodeURIComponent(rest.slice(0, sep)),
      contributionId: decodeURIComponent(rest.slice(sep + 1)),
    }
  } catch {
    return null
  }
}

export function appendCommunityContextMenuItems(
  items: ContextMenuItem[],
  contributions: CommunityContributionRef[],
): ContextMenuItem[] {
  if (!contributions.length) return items
  const extra: ContextMenuItem[] = [
    {id: 'community-plugin-divider', label: '', divider: true},
    ...contributions.map((c) => ({
      id: communityContextMenuActionId(c.pluginId, c.id),
      label: c.label,
      icon: 'star' as const,
    })),
  ]
  return [...items, ...extra]
}
