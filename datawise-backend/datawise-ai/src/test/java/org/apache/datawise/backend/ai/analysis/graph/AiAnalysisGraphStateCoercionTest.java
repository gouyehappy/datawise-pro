package org.apache.datawise.backend.ai.analysis.graph;

import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateCoercion;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class AiAnalysisGraphStateCoercionTest {

    @Test
    void coercesCheckpointStyleChatRequestMap() {
        Map<String, Object> requestMap = new LinkedHashMap<>();
        requestMap.put("prompt", "分析标签");
        requestMap.put("targets", List.of(Map.of(
                "connectionId", "conn-1",
                "database", "admin_db",
                "dbType", "mysql"
        )));
        requestMap.put("llm", Map.of(
                "provider", "mock",
                "model", "mock"
        ));

        AiChatRequest request = AiAnalysisGraphStateCoercion.chatRequest(requestMap);

        assertNotNull(request);
        assertEquals("分析标签", request.prompt());
        assertEquals("mock", request.llm().provider());
        assertEquals(1, request.targets().size());
    }

    @Test
    void coercesLlmTemperatureFromIntegerMapValue() {
        AiLlmProfileDto profile = AiAnalysisGraphStateCoercion.chatRequest(Map.of(
                "prompt", "test",
                "llm", Map.of(
                        "provider", "openai",
                        "temperature", 1
                )
        )).llm();

        assertEquals(1D, profile.temperature());
    }
}
