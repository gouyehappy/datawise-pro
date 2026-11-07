import {aiApi, type HttpRequestOptions} from '@/api'

export async function fetchAiSchemaTables(
    connectionId: string,
    database?: string,
    options?: HttpRequestOptions,
): Promise<string[]> {
    return aiApi.fetchSchemaTables(connectionId, database, options)
}
