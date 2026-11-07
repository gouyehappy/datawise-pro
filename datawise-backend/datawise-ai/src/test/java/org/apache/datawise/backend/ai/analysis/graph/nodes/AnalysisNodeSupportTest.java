package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateFactory;
import org.apache.datawise.backend.security.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class AnalysisNodeSupportTest {

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void runWithUserContext_restoresUserFromGraphStateOnWorkerThread() {
        OverAllState state = AiAnalysisGraphStateFactory.fromCheckpointData(Map.of(
                AiAnalysisGraphKeys.USER_ID, 12,
                AiAnalysisGraphKeys.USER_GUEST, false,
                AiAnalysisGraphKeys.SESSION_ID, "session-graph"
        ));

        AnalysisNodeSupport.runWithUserContext(state, () -> {
            assertEquals(12L, UserContext.requireUserId());
            assertEquals("session-graph", UserContext.getSessionId());
            return Map.of();
        });

        assertNull(UserContext.getUserId());
    }
}
