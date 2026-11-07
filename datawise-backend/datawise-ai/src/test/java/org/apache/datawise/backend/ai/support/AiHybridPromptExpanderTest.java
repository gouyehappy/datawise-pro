package org.apache.datawise.backend.ai.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiHybridPromptExpanderTest {

    @Test
    void expandsOpaqueChatEnvelopeToTemplate() {
        String envelope = AiHybridPromptProtocol.systemEnvelope("chat");
        String expanded = AiHybridPromptExpander.expandSystem(envelope);
        assertFalse(AiHybridPromptProtocol.isOpaqueSystemEnvelope(expanded));
        assertTrue(expanded.contains("database assistant"));
        assertEquals("chat.system", AiHybridPromptExpander.extractPromptRef(envelope));
    }

    @Test
    void passthroughNonOpaqueSystem() {
        String system = "Custom local system prompt";
        assertEquals(system, AiHybridPromptExpander.expandSystem(system));
    }

    @Test
    void expandsSqlGenerateRef() {
        String expanded = AiHybridPromptExpander.expandPromptRef("sql.generate.system");
        assertTrue(expanded.contains("SQL generator"));
    }
}
