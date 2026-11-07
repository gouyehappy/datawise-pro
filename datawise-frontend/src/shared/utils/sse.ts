/** Minimal SSE block parser + stream consumer shared by AI / migration / team streams. */

export function parseSseBlock(block: string): {event: string; data: string} | null {
    const lines = block.split('\n')
    let event = 'message'
    const dataLines: string[] = []
    for (const line of lines) {
        if (line.startsWith('event:')) {
            event = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim())
        }
    }
    if (!dataLines.length) return null
    return {event, data: dataLines.join('\n')}
}

export type SseBlockHandler = (block: string) => void

/**
 * Read an SSE body, split on blank lines, and invoke {@code onBlock} for each complete event.
 * Optional {@code signal} stops the loop when aborted (does not cancel the underlying reader).
 */
export async function consumeSseBlocks(
    body: ReadableStream<Uint8Array>,
    onBlock: SseBlockHandler,
    signal?: AbortSignal,
): Promise<void> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (!signal?.aborted) {
        const {done, value} = await reader.read()
        if (done) break

        buffer += decoder.decode(value, {stream: true})
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''

        for (const block of blocks) {
            if (block.trim()) onBlock(block)
        }
    }

    if (buffer.trim() && !signal?.aborted) {
        onBlock(buffer)
    }
}

/** Encode SSE text as a ReadableStream (tests / fixtures). */
export function encodeSseText(text: string): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    return new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(text))
            controller.close()
        },
    })
}
