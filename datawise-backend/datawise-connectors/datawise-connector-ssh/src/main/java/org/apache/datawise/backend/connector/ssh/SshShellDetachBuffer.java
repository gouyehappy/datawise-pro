package org.apache.datawise.backend.connector.ssh;

import java.io.ByteArrayOutputStream;
import java.util.Objects;
import java.util.function.Consumer;

/**
 * Holds PTY bytes while the WebSocket is briefly detached so a resume can replay them.
 */
final class SshShellDetachBuffer {

    private final int maxBytes;
    private final ByteArrayOutputStream buffer;
    private final Object lock = new Object();

    SshShellDetachBuffer(int maxBytes) {
        this.maxBytes = Math.max(1, maxBytes);
        this.buffer = new ByteArrayOutputStream(Math.min(this.maxBytes, 16_384));
    }

    void clear() {
        synchronized (lock) {
            buffer.reset();
        }
    }

    void append(byte[] chunk) {
        if (chunk == null || chunk.length == 0) {
            return;
        }
        synchronized (lock) {
            int overflow = buffer.size() + chunk.length - maxBytes;
            if (overflow > 0) {
                byte[] existing = buffer.toByteArray();
                buffer.reset();
                int skip = Math.min(overflow, existing.length);
                if (skip < existing.length) {
                    buffer.write(existing, skip, existing.length - skip);
                }
            }
            buffer.write(chunk, 0, chunk.length);
        }
    }

    byte[] drain() {
        synchronized (lock) {
            if (buffer.size() == 0) {
                return new byte[0];
            }
            byte[] out = buffer.toByteArray();
            buffer.reset();
            return out;
        }
    }

    int size() {
        synchronized (lock) {
            return buffer.size();
        }
    }

    static void deliver(byte[] pending, Consumer<byte[]> sink) {
        Objects.requireNonNull(sink, "sink");
        if (pending != null && pending.length > 0) {
            sink.accept(pending);
        }
    }
}
