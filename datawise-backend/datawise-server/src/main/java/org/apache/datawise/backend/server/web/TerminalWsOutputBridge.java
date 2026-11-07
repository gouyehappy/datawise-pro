package org.apache.datawise.backend.server.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Coalesces SSH PTY bytes into base64 WebSocket frames.
 * Avoids UTF-8 String slicing at read boundaries and reduces WS send storms.
 * Under flood, drops oldest buffered bytes so the latest screen stays usable (JCEF-friendly).
 */
final class TerminalWsOutputBridge implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(TerminalWsOutputBridge.class);

    private static final ScheduledExecutorService SHARED_FLUSH_SCHEDULER =
            Executors.newSingleThreadScheduledExecutor(r -> {
                Thread thread = new Thread(r, "terminal-ws-flush");
                thread.setDaemon(true);
                return thread;
            });

    static final String ENCODING_BASE64 = "base64";
    /** ~1 frame; keeps latency low while coalescing small reads. */
    static final int FLUSH_DELAY_MS = 16;
    /** Larger frames under flood → fewer WS/JSON encodes for JCEF. */
    static final int FLUSH_BYTES = 64 * 1024;
    /** Cap pending bytes before dropping oldest half (slow JCEF / congested WS). */
    static final int MAX_BUFFER_BYTES = 1024 * 1024;

    private final WebSocketSession socket;
    private final ObjectMapper objectMapper;
    private final String sessionId;
    private final Object sendLock;
    private final ScheduledExecutorService scheduler;
    private final ByteArrayOutputStream buffer = new ByteArrayOutputStream(8192);
    private final Object bufferLock = new Object();
    private final AtomicBoolean closed = new AtomicBoolean(false);
    private final AtomicLong droppedBytes = new AtomicLong();
    private long lastBackpressureLogAtMs;
    private ScheduledFuture<?> pendingFlush;

    TerminalWsOutputBridge(
            WebSocketSession socket,
            ObjectMapper objectMapper,
            String sessionId,
            Object sendLock
    ) {
        this(socket, objectMapper, sessionId, sendLock, SHARED_FLUSH_SCHEDULER);
    }

    TerminalWsOutputBridge(
            WebSocketSession socket,
            ObjectMapper objectMapper,
            String sessionId,
            Object sendLock,
            ScheduledExecutorService scheduler
    ) {
        this.socket = socket;
        this.objectMapper = objectMapper;
        this.sessionId = sessionId;
        this.sendLock = sendLock;
        this.scheduler = scheduler;
    }

    void accept(byte[] chunk) {
        if (chunk == null || chunk.length == 0 || closed.get()) {
            return;
        }
        byte[] toWrite = chunk;
        if (chunk.length > MAX_BUFFER_BYTES) {
            // Keep the newest half-cap so flood of giant reads still shows a usable tail.
            int keep = Math.max(4_096, MAX_BUFFER_BYTES / 2);
            int from = chunk.length - keep;
            toWrite = new byte[keep];
            System.arraycopy(chunk, from, toWrite, 0, keep);
            long total = droppedBytes.addAndGet(from);
            maybeLogBackpressure(from, total);
        }
        boolean flushNow = false;
        synchronized (bufferLock) {
            if (closed.get()) {
                return;
            }
            ensureCapacity(toWrite.length);
            buffer.write(toWrite, 0, toWrite.length);
            if (buffer.size() >= FLUSH_BYTES) {
                cancelPendingFlushLocked();
                flushNow = true;
            } else if (pendingFlush == null || pendingFlush.isDone()) {
                pendingFlush = scheduler.schedule(this::flushSafe, FLUSH_DELAY_MS, TimeUnit.MILLISECONDS);
            }
        }
        if (flushNow) {
            flush();
        }
    }

    void flush() {
        byte[] payload;
        synchronized (bufferLock) {
            cancelPendingFlushLocked();
            if (buffer.size() == 0) {
                return;
            }
            payload = buffer.toByteArray();
            buffer.reset();
        }
        sendBase64(payload);
    }

    long droppedBytes() {
        return droppedBytes.get();
    }

    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        flush();
    }

    private void flushSafe() {
        try {
            flush();
        } catch (Exception ex) {
            log.debug("SSH terminal output flush failed sessionId={}", sessionId, ex);
        }
    }

    private void ensureCapacity(int incoming) {
        int next = buffer.size() + incoming;
        if (next <= MAX_BUFFER_BYTES) {
            return;
        }
        // Drop oldest half so the latest screen stays useful under backpressure.
        byte[] all = buffer.toByteArray();
        buffer.reset();
        int keepFrom = all.length / 2;
        int dropped = keepFrom;
        if (keepFrom < all.length) {
            buffer.write(all, keepFrom, all.length - keepFrom);
        } else {
            dropped = all.length;
        }
        if (buffer.size() + incoming > MAX_BUFFER_BYTES) {
            dropped += buffer.size();
            buffer.reset();
        }
        if (dropped > 0) {
            long total = droppedBytes.addAndGet(dropped);
            maybeLogBackpressure(dropped, total);
        }
    }

    private void maybeLogBackpressure(int droppedNow, long totalDropped) {
        long now = System.currentTimeMillis();
        if (now - lastBackpressureLogAtMs < 5_000L) {
            return;
        }
        lastBackpressureLogAtMs = now;
        log.warn(
                "terminal.ws.backpressure sessionId={} droppedNow={} totalDropped≈{}",
                sessionId,
                droppedNow,
                totalDropped
        );
    }

    private void cancelPendingFlushLocked() {
        if (pendingFlush != null) {
            pendingFlush.cancel(false);
            pendingFlush = null;
        }
    }

    private void sendBase64(byte[] payload) {
        if (!socket.isOpen() || payload.length == 0) {
            return;
        }
        ObjectNode node = objectMapper.createObjectNode()
                .put("type", "output")
                .put("sessionId", sessionId)
                .put("encoding", ENCODING_BASE64)
                .put("data", Base64.getEncoder().encodeToString(payload));
        synchronized (sendLock) {
            if (!socket.isOpen()) {
                return;
            }
            try {
                socket.sendMessage(new TextMessage(objectMapper.writeValueAsString(node)));
            } catch (IOException ex) {
                log.debug("Failed to send coalesced SSH terminal output", ex);
            }
        }
    }
}
