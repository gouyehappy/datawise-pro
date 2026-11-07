package org.apache.datawise.backend.service.outbound;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OutboundEventPublisherMailGatewayTest {

    @Test
    void detectsMailtoAndBareEmailAsOperatorGatewayRewrite() {
        assertTrue(OutboundEventPublisher.isOperatorConfiguredMailGateway("mailto:ops@acme.com"));
        assertTrue(OutboundEventPublisher.isOperatorConfiguredMailGateway("ops@acme.com"));
        assertFalse(OutboundEventPublisher.isOperatorConfiguredMailGateway("https://hooks.example.com/x"));
        assertFalse(OutboundEventPublisher.isOperatorConfiguredMailGateway("http://10.1.2.3/hook"));
    }
}
