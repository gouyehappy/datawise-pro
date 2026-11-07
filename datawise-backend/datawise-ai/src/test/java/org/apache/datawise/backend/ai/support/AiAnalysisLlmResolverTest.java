package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiAnalysisLlmResolverTest {

    @Test
    void resolvesRouteProfileWhenPresent() {
        AiLlmProfileDto primary = new AiLlmProfileDto("mock", "", "", "primary", 0.2, 1024, null);
        AiLlmProfileDto sql = new AiLlmProfileDto("mock", "", "", "sql-model", 0.1, 2048, null);
        var request = new org.apache.datawise.backend.ai.domain.AiChatRequest(
                "prompt",
                java.util.List.of(),
                primary,
                null,
                false,
                java.util.List.of(),
                "smart",
                Map.of(AiAnalysisLlmResolver.ROUTE_SQL, sql)
        );
        assertEquals("sql-model", AiAnalysisLlmResolver.resolve(request, AiAnalysisLlmResolver.ROUTE_SQL).model());
        assertEquals("primary", AiAnalysisLlmResolver.resolve(request, AiAnalysisLlmResolver.ROUTE_SUMMARY).model());
    }
}
