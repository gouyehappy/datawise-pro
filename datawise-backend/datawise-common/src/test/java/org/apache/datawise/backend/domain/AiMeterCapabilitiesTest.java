package org.apache.datawise.backend.domain;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiMeterCapabilitiesTest {

    @Test
    void normalizesAliases() {
        assertEquals(AiMeterCapabilities.CHAT, AiMeterCapabilities.normalize("chat"));
        assertEquals(AiMeterCapabilities.SQL_GENERATE, AiMeterCapabilities.normalize("sql.generate"));
        assertEquals(AiMeterCapabilities.ANALYZE, AiMeterCapabilities.normalize("analysis"));
        assertEquals(AiMeterCapabilities.SEMANTIC_AUTO, AiMeterCapabilities.normalize("semantic.auto"));
        assertEquals(AiMeterCapabilities.FEDERATED_SQL, AiMeterCapabilities.normalize("federated-sql"));
        assertEquals(AiMeterCapabilities.CANVAS_RERUN, AiMeterCapabilities.normalize("canvas.rerun"));
        assertEquals(AiMeterCapabilities.OTHER, AiMeterCapabilities.normalize(" "));
        assertEquals("ai.custom", AiMeterCapabilities.normalize("custom"));
    }
}
