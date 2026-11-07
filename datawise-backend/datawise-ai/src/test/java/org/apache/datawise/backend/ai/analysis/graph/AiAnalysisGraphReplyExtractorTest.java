package org.apache.datawise.backend.ai.analysis.graph;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphReplyExtractor;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateFactory;
import org.apache.datawise.backend.ai.domain.AiChatReply;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiAnalysisGraphReplyExtractorTest {

    @Test
    void coercesGsonStyleReplyMap() {
        Map<String, Object> replyMap = new LinkedHashMap<>();
        replyMap.put("reply", "分析完成");
        replyMap.put("mode", "analysis");
        replyMap.put("sql", "SELECT 1");
        replyMap.put("columns", List.of());
        replyMap.put("rows", List.of());

        OverAllState state = AiAnalysisGraphStateFactory.fromCheckpointData(Map.of(
                AiAnalysisGraphKeys.REPLY, replyMap
        ));

        AiChatReply reply = AiAnalysisGraphReplyExtractor.requireReply(state);
        assertEquals("analysis", reply.mode());
        assertEquals("SELECT 1", reply.sql());
    }
}
