package org.apache.datawise.backend.connector.ssh;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

class SshShellDetachBufferTest {

    @Test
    void drainsBufferedBytesFifoWithCap() {
        SshShellDetachBuffer buffer = new SshShellDetachBuffer(8);
        buffer.append("abcdefgh".getBytes(StandardCharsets.UTF_8));
        buffer.append("ij".getBytes(StandardCharsets.UTF_8));
        assertEquals(8, buffer.size());
        assertArrayEquals("cdefghij".getBytes(StandardCharsets.UTF_8), buffer.drain());
        assertEquals(0, buffer.size());
    }

    @Test
    void deliverForwardsNonEmpty() {
        AtomicReference<byte[]> seen = new AtomicReference<>();
        SshShellDetachBuffer.deliver("hi".getBytes(StandardCharsets.UTF_8), seen::set);
        assertArrayEquals("hi".getBytes(StandardCharsets.UTF_8), seen.get());
    }
}
