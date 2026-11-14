import type {ThirdPartyImportSource} from './types'

export function detectThirdPartyConnectionSource(
    text: string,
    fileName = '',
): ThirdPartyImportSource | null {
    const name = fileName.trim().toLowerCase()
    const trimmed = text.trim()
    if (!trimmed) return null

    if (name.endsWith('.ncx') || /<\s*Connections\b/i.test(trimmed) && /ConnType\s*=/i.test(trimmed)) {
        return 'navicat'
    }
    if (
        name.includes('datasources') && name.endsWith('.xml')
        || /<\s*data-source\b/i.test(trimmed)
        || /DataSourceManagerImpl/i.test(trimmed)
    ) {
        return 'datagrip'
    }
    if (name.includes('data-sources') && name.endsWith('.json')) {
        return 'dbeaver'
    }
    try {
        const json = JSON.parse(trimmed) as Record<string, unknown>
        if (json && typeof json === 'object' && json.connections && typeof json.connections === 'object') {
            const first = Object.values(json.connections as Record<string, unknown>)[0] as
                | Record<string, unknown>
                | undefined
            if (first && (first.provider || first.driver || first.configuration)) {
                return 'dbeaver'
            }
        }
    } catch {
        // not JSON
    }
    return null
}

export const THIRD_PARTY_IMPORT_ACCEPT =
    '.dwprofile,.json,.xml,.ncx,dataSources.xml,data-sources.json,application/json,application/xml,text/xml,application/octet-stream'
