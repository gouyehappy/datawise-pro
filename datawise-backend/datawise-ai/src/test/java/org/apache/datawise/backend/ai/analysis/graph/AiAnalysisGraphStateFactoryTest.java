package org.apache.datawise.backend.ai.analysis.graph;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateFactory;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiAnalysisGraphStateFactoryTest {

    @Test
    void mergesInvokeInputForRegisteredRequestKey() {
        OverAllState state = new AiAnalysisGraphStateFactory().create();
        AiChatRequest request = new AiChatRequest("分析销售额", List.of(), null, null, null);

        state.input(Map.of(AiAnalysisGraphKeys.REQUEST, request));

        assertTrue(state.value(AiAnalysisGraphKeys.REQUEST, AiChatRequest.class).isPresent());
    }

    @Test
    void restoresCheckpointDataWithRegisteredKeys() {
        AiChatRequest request = new AiChatRequest("分析销售额", List.of(), null, null, null);
        OverAllState state = AiAnalysisGraphStateFactory.fromCheckpointData(Map.of(
                AiAnalysisGraphKeys.REQUEST, request,
                AiAnalysisGraphKeys.SAFE_SQL, "SELECT 1"
        ));

        assertTrue(state.value(AiAnalysisGraphKeys.REQUEST, AiChatRequest.class).isPresent());
        assertEquals("SELECT 1", state.value(AiAnalysisGraphKeys.SAFE_SQL, ""));
    }
}
