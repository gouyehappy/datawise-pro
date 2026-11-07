package org.apache.datawise.backend.common.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class OutboundHttpUrlPolicyTest {

    @Test
    void allowsPublicHttpsAndLoopback() {
        assertDoesNotThrow(() -> OutboundHttpUrlPolicy.requireAllowedOutboundUrl("https://hooks.example.com/x", false));
        assertDoesNotThrow(() -> OutboundHttpUrlPolicy.requireAllowedOutboundUrl("http://127.0.0.1:8080/hook", false));
        assertDoesNotThrow(() -> OutboundHttpUrlPolicy.requireAllowedOutboundUrl("mailto:ops@acme.com", false));
    }

    @Test
    void rejectsPrivateNetworksUnlessAllowed() {
        assertThrows(
                IllegalArgumentException.class,
                () -> OutboundHttpUrlPolicy.requireAllowedOutboundUrl("http://10.1.2.3/hook", false));
        assertDoesNotThrow(() -> OutboundHttpUrlPolicy.requireAllowedOutboundUrl("http://10.1.2.3/hook", true));
    }

    @Test
    void rejectsNonHttpSchemes() {
        assertThrows(
                IllegalArgumentException.class,
                () -> OutboundHttpUrlPolicy.requireAllowedOutboundUrl("file:///etc/passwd", false));
    }
}
