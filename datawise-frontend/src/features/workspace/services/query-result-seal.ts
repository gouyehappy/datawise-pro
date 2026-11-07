import {markRaw} from 'vue'
import type {QueryResultItem} from '@/features/workspace/types'

/**
 * Prevent Vue from deeply proxying large result payloads.
 * Rows/columns stay immutable from the UI's perspective after seal;
 * the item itself is markRaw so nested label edits still work without deep observers.
 */
export function sealQueryResultPayload<T extends QueryResultItem>(item: T): T {
    if (Array.isArray(item.rows)) {
        item.rows = markRaw(item.rows)
    }
    if (Array.isArray(item.columns)) {
        item.columns = markRaw(item.columns)
    }
    return markRaw(item)
}

export function sealQueryResultList(results: QueryResultItem[]): QueryResultItem[] {
    for (const item of results) {
        sealQueryResultPayload(item)
    }
    return markRaw(results)
}
