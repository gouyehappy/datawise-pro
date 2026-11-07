package org.apache.datawise.backend.common.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConnectionProbeTargetPolicyTest {

    @Test
    void allowsLoopbackAndLocalhost() {
        assertDoesNotThrow(() -> ConnectionProbeTargetPolicy.requireAllowedProbeHost("127.0.0.1", "Host"));
        assertDoesNotThrow(() -> ConnectionProbeTargetPolicy.requireAllowedProbeHost("localhost", "Host"));
    }

    @Test
    void allowPrivateNetworks_skipsPrivateLiteralCheck() {
        assertDoesNotThrow(() -> ConnectionProbeTargetPolicy.requireAllowedProbeHost("10.1.2.3", "Host", true));
    }

    @Test
    void rejectsPrivateIpv4() {
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> ConnectionProbeTargetPolicy.requireAllowedProbeHost("10.1.2.3", "Host"));
        assertTrue(ex.getMessage().contains("private or link-local"));
    }
}
