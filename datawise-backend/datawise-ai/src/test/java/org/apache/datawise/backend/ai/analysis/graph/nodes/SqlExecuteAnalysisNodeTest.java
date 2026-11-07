package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.federated.FederatedSqlExecutionSupport;
import org.apache.datawise.backend.ai.config.AiAnalysisProperties;
import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;
import org.apache.datawise.backend.common.SqlExecutionException;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.ai.domain.AiEvidenceBundle;
import org.apache.datawise.backend.database.sql.SqlService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.api.BeforeEach;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SqlExecuteAnalysisNodeTest {

    @Mock
    private SqlService sqlService;

    @Mock
    private SqlExecutionRetrySupport executionRetrySupport;

    @Mock
    private FederatedSqlExecutionSupport federatedSqlExecutionSupport;

    private SqlExecuteAnalysisNode node;

    @BeforeEach
    void setUp() {
        node = new SqlExecuteAnalysisNode(
                sqlService,
                executionRetrySupport,
                federatedSqlExecutionSupport,
                new AiAnalysisProperties()
        );
    }

    @Test
    void marksExecutionOkOnSuccess() {
        when(sqlService.execute(any(), any(), any(), anyInt(), any()))
                .thenReturn(new ExecuteSqlResult("SELECT 1", 0, 12L, List.of(), List.of(), null, null, null, null, null, null));

        OverAllState state = new OverAllState(Map.of(
                AiAnalysisGraphKeys.REQUEST, new AiChatRequest("q", List.of(), null, null, null),
                AiAnalysisGraphKeys.SAFE_SQL, "SELECT 1",
                AiAnalysisGraphKeys.CONNECTION_ID, "c1",
                AiAnalysisGraphKeys.DATABASE, "db1",
                AiAnalysisGraphKeys.PROMPT, "q"
        ));

        Map<String, Object> updates = node.execute(state);

        assertTrue((Boolean) updates.get(AiAnalysisGraphKeys.EXECUTION_OK));
        assertEquals("", updates.get(AiAnalysisGraphKeys.EXECUTION_ERROR));
        assertTrue(updates.containsKey(AiAnalysisGraphKeys.EXECUTE_RESULT));
    }

    @Test
    void retriesWithSchemaThenFailsAfterSecondAttempt() {
        when(sqlService.execute(eq("SELECT c.name FROM cdp_tag c"), any(), any(), anyInt(), any()))
                .thenThrow(new SqlExecutionException("Unknown column 'c.name' in 'field list'", null, 1));
        when(sqlService.execute(eq("SELECT category_id FROM cdp_tag"), any(), any(), anyInt(), any()))
                .thenThrow(new SqlExecutionException("Unknown column 'category_id' in 'field list'", null, 1));

        when(executionRetrySupport.regenerateValidatedSql(
                any(), any(), any(), any(), any(), any(), any(), any(), any()
        )).thenReturn("SELECT category_id FROM cdp_tag");

        OverAllState state = new OverAllState(Map.of(
                AiAnalysisGraphKeys.REQUEST, new AiChatRequest("q", List.of(), null, null, null),
                AiAnalysisGraphKeys.SAFE_SQL, "SELECT c.name FROM cdp_tag c",
                AiAnalysisGraphKeys.CONNECTION_ID, "c1",
                AiAnalysisGraphKeys.DATABASE, "db1",
                AiAnalysisGraphKeys.PROMPT, "q",
                AiAnalysisGraphKeys.EVIDENCE, AiEvidenceBundle.empty("q"),
                AiAnalysisGraphKeys.SCHEMA, new AiSqlSchemaContext("conn", "db1", "mysql", List.of("cdp_tag"), List.of())
        ));

        Map<String, Object> updates = node.execute(state);

        assertFalse((Boolean) updates.get(AiAnalysisGraphKeys.EXECUTION_OK));
        assertEquals("Unknown column 'category_id' in 'field list'", updates.get(AiAnalysisGraphKeys.EXECUTION_ERROR));
        verify(sqlService, times(2)).execute(any(), any(), any(), any(), any());
        verify(executionRetrySupport).regenerateValidatedSql(
                any(), any(), eq("c1"), eq("db1"), any(), any(), any(), any(), any()
        );
    }
}
