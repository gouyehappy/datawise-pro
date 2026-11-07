import type {ContextMenuItem} from '@/core/types'

/** 过滤无权限项后，去掉首尾与连续的孤立分隔线。 */
export function pruneContextMenuDividers(items: ContextMenuItem[]): ContextMenuItem[] {
    const filtered: ContextMenuItem[] = []
    for (const item of items) {
        if (item.divider) {
            if (filtered.length > 0 && !filtered[filtered.length - 1]?.divider) {
                filtered.push(item)
            }
            continue
        }
        filtered.push(item)
    }
    if (filtered.length > 0 && filtered[filtered.length - 1]?.divider) {
        filtered.pop()
    }
    return filtered
}
