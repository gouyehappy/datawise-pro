package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.config.AiDeliveryProperties;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiHybridPromptProtocolTest {

    @Test
    void systemEnvelopeHasNoTemplateBody() {
        String envelope = AiHybridPromptProtocol.systemEnvelope("chat");
        assertTrue(AiHybridPromptProtocol.isOpaqueSystemEnvelope(envelope));
        assertTrue(envelope.contains("\"promptRef\":\"chat.system\""));
        assertFalse(envelope.contains("You are a database assistant"));
        assertFalse(envelope.contains("DataWise"));
    }

    @Test
    void promptRefMapsKnownPhases() {
        assertEquals("sql.generate.system", AiHybridPromptProtocol.promptRefFor("sql-generate"));
        assertEquals("analysis.summary.system", AiHybridPromptProtocol.promptRefFor("analysis-summary"));
        assertEquals("phase.custom.step", AiHybridPromptProtocol.promptRefFor("custom/step"));
    }

    @Test
    void gatewayOpaqueReplacesRenderedSystem() {
        AiDeliveryProperties props = new AiDeliveryProperties();
        props.setDelivery("hybrid");
        props.setHybridBaseUrl("https://ai-gateway.example/v1");
        props.setOpaquePrompts(true);

        String rendered = "You are a database assistant for DataWise.\nSecret template IP.";
        String wire = AiHybridPromptProtocol.resolveWireSystemPrompt(props, "chat", rendered);

        assertTrue(AiHybridPromptProtocol.isOpaqueSystemEnvelope(wire));
        assertFalse(wire.contains("Secret template"));
        assertFalse(wire.contains("You are a database assistant"));
    }

    @Test
    void offlineKeepsRenderedSystem() {
        AiDeliveryProperties props = new AiDeliveryProperties();
        String rendered = "You are a database assistant for DataWise.";
        assertEquals(rendered, AiHybridPromptProtocol.resolveWireSystemPrompt(props, "chat", rendered));
    }

    @Test
    void opaqueCanBeDisabledEvenWithHybridGateway() {
        AiDeliveryProperties props = new AiDeliveryProperties();
        props.setDelivery("hybrid");
        props.setHybridBaseUrl("https://ai-gateway.example/v1");
        props.setOpaquePrompts(false);

        String rendered = "Full template text";
        assertEquals(rendered, AiHybridPromptProtocol.resolveWireSystemPrompt(props, "chat", rendered));
    }
}
