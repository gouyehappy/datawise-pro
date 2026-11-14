import {postJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

export interface AgentWriteGrant {
    grantId: string
    conversationId: string
    connectionId: string
    database?: string | null
    schema?: string | null
    sqlHash: string
    expiresAt: string
    consumed: boolean
}

export async function issueAgentWriteGrant(body: {
    conversationId: string
    connectionId: string
    database?: string | null
    schema?: string | null
    confirmedSql: string
}): Promise<AgentWriteGrant> {
    return postJson<AgentWriteGrant>(API_PATHS.ai.writeGrants, body)
}
