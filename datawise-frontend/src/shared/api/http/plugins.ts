import type {PluginApi} from '@/shared/api/types'
import type {PluginItem} from '@/core/types'
import type {PluginItemDto} from '@/shared/api/generated'
import {getJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

function mapPlugin(wire: PluginItemDto): PluginItem {
    const category = wire.category
    const allowed = new Set(['datasource', 'export', 'ai', 'tool'])
    return {
        id: String(wire.id ?? ''),
        name: String(wire.name ?? ''),
        version: String(wire.version ?? ''),
        author: String(wire.author ?? ''),
        description: String(wire.description ?? ''),
        enabled: Boolean(wire.enabled),
        category: (allowed.has(String(category)) ? category : 'tool') as PluginItem['category'],
    }
}

/** Plugins HTTP client — list wire DTOs from OpenAPI (`PluginItemDto`). */
export function createHttpPluginApi(): PluginApi {
    return {
        fetchAll: async () => {
            const list = await getJson<PluginItemDto[]>(API_PATHS.plugins)
            return (list ?? []).map(mapPlugin)
        },
    }
}
