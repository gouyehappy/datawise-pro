import {consumeSseBlocks, parseSseBlock, encodeSseText} from '@/shared/utils/sse'
import {API_PATHS} from '@/shared/api/http/paths'
import {buildApiUrl, buildSessionHeaders} from '@/shared/api/http/request'

export interface TeamSharedQueryUpdatedEvent {
    teamId: string
    queryId: string
    updatedAt: string
    updatedByUserId?: number | null
    updatedByUserName?: string | null
}

export interface TeamSharedQueryViewer {
    userId: number
    userName: string
}

export interface TeamSharedQueryPresenceEvent {
    teamId: string
    queryId: string
    viewers: TeamSharedQueryViewer[]
}

export interface TeamSharedQueryStreamHandlers {
    onConnected?: (event: TeamSharedQueryUpdatedEvent) => void
    onUpdated?: (event: TeamSharedQueryUpdatedEvent) => void
    onPresence?: (event: TeamSharedQueryPresenceEvent) => void
    onDisconnected?: () => void
}

function dispatchTeamSharedQuerySseBlock(block: string, handlers: TeamSharedQueryStreamHandlers) {
    const parsed = parseSseBlock(block.trim())
    if (!parsed) return

    if (parsed.event === 'connected') {
        handlers.onConnected?.(JSON.parse(parsed.data) as TeamSharedQueryUpdatedEvent)
        return
    }
    if (parsed.event === 'updated') {
        handlers.onUpdated?.(JSON.parse(parsed.data) as TeamSharedQueryUpdatedEvent)
        return
    }
    if (parsed.event === 'presence') {
        handlers.onPresence?.(JSON.parse(parsed.data) as TeamSharedQueryPresenceEvent)
    }
}

async function consumeTeamSharedQuerySseStream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
    handlers: TeamSharedQueryStreamHandlers,
) {
    await consumeSseBlocks(body, (block) => dispatchTeamSharedQuerySseBlock(block, handlers), signal)
}

/** GET SSE：订阅团队共享 Query 协同更新。返回取消订阅函数。 */
export function subscribeTeamSharedQueryStream(
    teamId: string,
    queryId: string,
    handlers: TeamSharedQueryStreamHandlers,
): () => void {
    const controller = new AbortController()

    void (async () => {
        try {
            const response = await fetch(buildApiUrl(API_PATHS.teams.sharedQueryStream(teamId, queryId)), {
                method: 'GET',
                headers: {
                    Accept: 'text/event-stream',
                    ...buildSessionHeaders(),
                },
                credentials: 'include',
                signal: controller.signal,
            })
            if (!response.ok || !response.body) {
                handlers.onDisconnected?.()
                return
            }
            await consumeTeamSharedQuerySseStream(response.body, controller.signal, handlers)
        } catch {
            if (!controller.signal.aborted) {
                handlers.onDisconnected?.()
            }
        }
    })()

    return () => controller.abort()
}

/** 测试用：将 SSE 文本编码为 ReadableStream */
export function encodeTeamSharedQuerySseText(text: string): ReadableStream<Uint8Array> {
    return encodeSseText(text)
}

export async function consumeTeamSharedQuerySseStreamForTest(
    body: ReadableStream<Uint8Array>,
    handlers: TeamSharedQueryStreamHandlers,
): Promise<void> {
    const controller = new AbortController()
    await consumeTeamSharedQuerySseStream(body, controller.signal, handlers)
}
