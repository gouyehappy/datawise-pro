package org.apache.datawise.backend.ai.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiDeliveryPropertiesTest {

    @Test
    void defaultIsOfflineWithoutGateway() {
        AiDeliveryProperties props = new AiDeliveryProperties();
        assertFalse(props.isHybrid());
        assertFalse(props.isHybridGatewayConfigured());
        assertEquals("https://api.openai.com", props.resolveBaseUrl("https://api.openai.com"));
    }

    @Test
    void hybridWithoutUrlFallsBackToProfile() {
        AiDeliveryProperties props = new AiDeliveryProperties();
        props.setDelivery("hybrid");
        props.setHybridBaseUrl("  ");
        assertTrue(props.isHybrid());
        assertFalse(props.isHybridGatewayConfigured());
        assertEquals("https://llm.local", props.resolveBaseUrl("https://llm.local"));
    }

    @Test
    void hybridWithUrlOverridesProfile() {
        AiDeliveryProperties props = new AiDeliveryProperties();
        props.setDelivery("HYBRID");
        props.setHybridBaseUrl(" https://ai-gateway.example/v1 ");
        assertTrue(props.isHybridGatewayConfigured());
        assertEquals("https://ai-gateway.example/v1", props.resolveBaseUrl("https://api.openai.com"));
    }

    @Test
    void opaquePromptsOnlyWhenHybridGatewayConfigured() {
        AiDeliveryProperties props = new AiDeliveryProperties();
        assertTrue(props.isOpaquePrompts());
        assertFalse(props.shouldUseOpaquePrompts());

        props.setDelivery("hybrid");
        props.setHybridBaseUrl("https://ai-gateway.example/v1");
        assertTrue(props.shouldUseOpaquePrompts());

        props.setOpaquePrompts(false);
        assertFalse(props.shouldUseOpaquePrompts());
    }
}
