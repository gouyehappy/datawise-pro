import {fetchConnectionFromCatalog} from '@/shared/config/connections-catalog.service'

export async function fetchConnectionHost(
    connectionId: string,
    connectionName?: string,
): Promise<string | undefined> {
    if (connectionName?.trim()) {
        return connectionName.trim()
    }
    try {
        const config = await fetchConnectionFromCatalog(connectionId)
        if (!config) return undefined
        return config.host?.trim() || config.name?.trim() || undefined
    } catch {
        return undefined
    }
}
