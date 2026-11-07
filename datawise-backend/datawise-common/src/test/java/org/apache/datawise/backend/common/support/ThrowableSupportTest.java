package org.apache.datawise.backend.common.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ThrowableSupportTest {

    @Test
    void rootMessage_returnsDeepestCauseMessage() {
        assertEquals(
                "root",
                ThrowableSupport.rootMessage(new IllegalStateException("outer", new IllegalArgumentException("root"))));
    }
}
