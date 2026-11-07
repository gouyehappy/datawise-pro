package org.apache.datawise.backend.ai.analysis.plan;

import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.domain.AiDatabaseTargetDto;
import org.apache.datawise.backend.ai.domain.AiAnalysisPlan;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiAnalysisPlannerServiceTest {

    private final AiAnalysisPlannerService planner = new AiAnalysisPlannerService();

    @Test
    void detectsPythonPlanFromPrompt() {
        AiChatRequest request = new AiChatRequest(
                "用 pandas 做销售趋势回归分析",
                List.of(new AiDatabaseTargetDto("c1", "conn", "db1", "db1", null, "mysql")),
                null,
                null,
                null
        );
        AiAnalysisPlan plan = planner.plan(request, request.prompt());
        assertEquals(AiAnalysisPlan.MODE_SQL_THEN_PYTHON, plan.mode());
        assertTrue(plan.requiresPython());
    }

    @Test
    void detectsFederatedPlanForMultipleTargets() {
        AiChatRequest request = new AiChatRequest(
                "对比两个库的销售",
                List.of(
                        new AiDatabaseTargetDto("c1", "conn-a", "db1", "db1", null, "mysql"),
                        new AiDatabaseTargetDto("c2", "conn-b", "db2", "db2", null, "mysql")
                ),
                null,
                null,
                null
        );
        AiAnalysisPlan plan = planner.plan(request, request.prompt());
        assertEquals(AiAnalysisPlan.MODE_FEDERATED, plan.mode());
        assertTrue(plan.federated());
    }

    @Test
    void doesNotTreatSameDatabaseTablesAsFederated() {
        AiChatRequest request = new AiChatRequest(
                "分析当年的销售情况",
                List.of(
                        new AiDatabaseTargetDto("c1", "MySQL@host", "aaflinktest", "aaflinktest", "orders", "mysql"),
                        new AiDatabaseTargetDto("c1", "MySQL@host", "aaflinktest", "aaflinktest", "users", "mysql"),
                        new AiDatabaseTargetDto("c1", "MySQL@host", "aaflinktest", "aaflinktest", "order_detail", "mysql")
                ),
                null,
                null,
                null
        );
        AiAnalysisPlan plan = planner.plan(request, request.prompt());
        assertEquals(AiAnalysisPlan.MODE_SQL_ONLY, plan.mode());
        assertFalse(plan.federated());
        assertEquals(1, plan.targetLabels().size());
    }
}
