import {getJson, postJson, type HttpRequestOptions} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'
import type {McpConfirmTicket} from '@/features/ai/mcp-confirm/types'

export async function listPendingMcpConfirmations(
    options?: HttpRequestOptions,
): Promise<McpConfirmTicket[]> {
    const rows = await getJson<McpConfirmTicket[]>(
        API_PATHS.platform.mcpConfirmations,
        undefined,
        options,
    )
    return Array.isArray(rows) ? rows : []
}

export async function decideMcpConfirmation(
    ticketId: string,
    decision: 'confirm' | 'reject',
    note?: string,
): Promise<McpConfirmTicket> {
    return postJson<McpConfirmTicket>(API_PATHS.platform.mcpConfirmationDecide(ticketId), {
        decision,
        note,
    })
}
