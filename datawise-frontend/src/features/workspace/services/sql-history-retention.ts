/** §2.1 — free Standard SQL history retention (Wave 38). */
export const FREE_SQL_HISTORY_MAX_ENTRIES = 200

/** Keep newest-first logs within the free retention cap. */
export function retainFreeSqlHistoryEntries<T>(entries: readonly T[]): T[] {
    if (entries.length <= FREE_SQL_HISTORY_MAX_ENTRIES) {
        return [...entries]
    }
    return entries.slice(0, FREE_SQL_HISTORY_MAX_ENTRIES)
}
