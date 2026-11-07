export type McpConfirmStatus =
    | 'pending'
    | 'confirmed'
    | 'rejected'
    | 'expired'
    | 'cancelled'

export interface McpConfirmTicket {
    ticketId: string
    tool: string
    risk: string
    summary: string
    preview: Record<string, unknown>
    status: McpConfirmStatus
    createdAt: string
    expiresAt: string
    decidedAt?: string | null
    decideNote?: string | null
    execution?: Record<string, unknown> | null
}
