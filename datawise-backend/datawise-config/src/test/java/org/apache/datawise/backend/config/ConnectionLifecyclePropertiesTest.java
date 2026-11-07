package org.apache.datawise.backend.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConnectionLifecyclePropertiesTest {

    @Test
    void clampsIdleEvictMsToMinimum() {
        ConnectionLifecycleProperties properties = new ConnectionLifecycleProperties();
        properties.setIdleEvictMs(1_000);
        assertEquals(60_000, properties.getIdleEvictMs());
    }

    @Test
    void defaultsEnableIdleEviction() {
        ConnectionLifecycleProperties properties = new ConnectionLifecycleProperties();
        assertTrue(properties.isIdleEvictEnabled());
        assertEquals(900_000, properties.getIdleEvictMs());
        assertEquals(64, properties.getMaxActivePools());
    }

    @Test
    void clampsMaxActivePoolsToNonNegative() {
        ConnectionLifecycleProperties properties = new ConnectionLifecycleProperties();
        properties.setMaxActivePools(-3);
        assertEquals(0, properties.getMaxActivePools());
    }
}
