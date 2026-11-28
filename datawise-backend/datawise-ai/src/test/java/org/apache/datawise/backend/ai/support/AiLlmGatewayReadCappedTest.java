package org.apache.datawise.backend.ai.support;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiLlmGatewayReadCappedTest {

    @Test
    void readCapped_returnsBytesWithinLimit() throws IOException {
        byte[] input = "hello".getBytes(StandardCharsets.UTF_8);
        byte[] out = AiLlmGateway.readCapped(new ByteArrayInputStream(input), 16);
        assertArrayEquals(input, out);
    }

    @Test
    void readCapped_throwsWhenOverLimit() {
        byte[] input = "0123456789".getBytes(StandardCharsets.UTF_8);
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> AiLlmGateway.readCapped(new ByteArrayInputStream(input), 4));
        assertTrue(ex.getMessage().contains("exceeds"));
    }
}
