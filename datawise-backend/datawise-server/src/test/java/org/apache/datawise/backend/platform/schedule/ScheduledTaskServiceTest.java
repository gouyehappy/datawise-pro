package org.apache.datawise.backend.platform.schedule;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.pack.AnalysisCanvasTaskRunner;
import org.apache.datawise.backend.common.pack.BackupScheduleRunner;
import org.apache.datawise.backend.configstore.ScheduledTaskStore;
import org.apache.datawise.backend.database.drift.SchemaDriftService;
import org.apache.datawise.backend.database.sql.SqlReviewService;
import org.apache.datawise.backend.database.sql.SqlService;
import org.apache.datawise.backend.domain.DataQualityGateRequest;
import org.apache.datawise.backend.domain.DataQualityGateResultDto;
import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.OutboundEventType;
import org.apache.datawise.backend.domain.SaveScheduledTaskRequest;
import org.apache.datawise.backend.domain.ScheduledTaskDto;
import org.apache.datawise.backend.domain.SqlReviewRequest;
import org.apache.datawise.backend.domain.SqlReviewResultDto;
import org.apache.datawise.backend.model.ScheduledTaskEntry;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.InstanceWorkspaceService;
import org.apache.datawise.backend.service.TeamService;
import org.apache.datawise.backend.service.outbound.OutboundNotifySupport;
import org.apache.datawise.backend.service.workspace.WorkspaceNotificationService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ScheduledTaskServiceTest {

    private ScheduledTaskStore taskStore;
    private SqlService sqlService;
    private SqlReviewService sqlReviewService;
    private TeamService teamService;
    private InstanceWorkspaceService instanceWorkspaceService;
    private AnalysisCanvasTaskRunner analysisCanvasTaskRunner;
    private OutboundNotifySupport outboundNotifySupport;
    private BackupScheduleRunner backupScheduleRunner;
    private ScheduledTaskService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        taskStore = mock(ScheduledTaskStore.class);
        sqlService = mock(SqlService.class);
        sqlReviewService = mock(SqlReviewService.class);
        teamService = mock(TeamService.class);
        instanceWorkspaceService = mock(InstanceWorkspaceService.class);
        analysisCanvasTaskRunner = mock(AnalysisCanvasTaskRunner.class);
        ObjectProvider<AnalysisCanvasTaskRunner> canvasProvider = mock(ObjectProvider.class);
        when(canvasProvider.getIfAvailable()).thenReturn(analysisCanvasTaskRunner);
        outboundNotifySupport = mock(OutboundNotifySupport.class);
        backupScheduleRunner = mock(BackupScheduleRunner.class);
        ObjectProvider<BackupScheduleRunner> backupProvider = mock(ObjectProvider.class);
        when(backupProvider.getIfAvailable()).thenReturn(backupScheduleRunner);
        service = new ScheduledTaskService(
                taskStore,
                sqlService,
                sqlReviewService,
                mock(SchemaDriftService.class),
                canvasProvider,
                teamService,
                instanceWorkspaceService,
                mock(WorkspaceNotificationService.class),
                outboundNotifySupport,
                new ObjectMapper(),
                backupProvider
        );
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void runNowBlocksSqlThatRequiresProductionApproval() {
        ScheduledTaskEntry entry = sqlTask("INSERT INTO users(id) VALUES (1)");
        when(taskStore.findById("task-1")).thenReturn(entry);
        when(sqlReviewService.review(any(SqlReviewRequest.class)))
                .thenReturn(new SqlReviewResultDto(true, true, List.of()));

        ScheduledTaskDto result = service.runNow("task-1");

        assertEquals("failed", result.lastRunStatus());
        assertEquals("SQL requires production approval", result.lastRunMessage());
        verifyNoInteractions(sqlService);
        verifyNoInteractions(teamService);
        verify(taskStore).upsert(entry);
    }

    @Test
    void runNowAuditsWriteSqlAfterSuccessfulExecution() {
        String sql = "INSERT INTO users(id) VALUES (1)";
        ScheduledTaskEntry entry = sqlTask(sql);
        when(taskStore.findById("task-1")).thenReturn(entry);
        when(sqlReviewService.review(any(SqlReviewRequest.class)))
                .thenReturn(new SqlReviewResultDto(true, false, List.of()));

        ScheduledTaskDto result = service.runNow("task-1");

        assertEquals("ok", result.lastRunStatus());
        assertTrue(result.lastRunMessage().contains("1 statement"));
        verify(sqlReviewService).review(new SqlReviewRequest(sql, "conn-1", "app"));
        verify(sqlService).execute(any(ExecuteSqlRequest.class));
        verify(teamService).recordSqlExecutionAudit("sql.write", "conn-1", "app", sql);
        verify(taskStore).upsert(entry);
    }

    @Test
    void runNowLoadsWorkspaceSqlFileAndExecutesBatch() throws Exception {
        ScheduledTaskEntry entry = new ScheduledTaskEntry();
        entry.setId("task-file");
        entry.setName("Nightly file");
        entry.setType(ScheduledTaskEntry.TYPE_SQL);
        entry.setCronExpression("0 0 * * * *");
        entry.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
        entry.setPayloadJson(
                "{\"source\":\"workspace_file\",\"connectionId\":\"conn-1\",\"database\":\"app\",\"sqlFile\":\"job.sql\"}"
        );
        when(taskStore.findById("task-file")).thenReturn(entry);
        when(instanceWorkspaceService.readSql("conn-1", "app", "job.sql"))
                .thenReturn("SELECT 1; SELECT 2;");
        when(sqlReviewService.review(any(SqlReviewRequest.class)))
                .thenReturn(new SqlReviewResultDto(true, false, List.of()));

        ScheduledTaskDto result = service.runNow("task-file");

        assertEquals("ok", result.lastRunStatus());
        assertTrue(result.lastRunMessage().contains("2 statement"));
        assertTrue(result.lastRunMessage().contains("workspace_file"));
        verify(sqlService, times(2)).execute(any(ExecuteSqlRequest.class));
        verify(instanceWorkspaceService).readSql(eq("conn-1"), eq("app"), eq("job.sql"));
    }

    @Test
    void runNowExecutesCanvasPipelineAndStoresSummary() {
        ScheduledTaskEntry entry = canvasTask("canvas-1");
        when(taskStore.findById("task-canvas")).thenReturn(entry);
        when(analysisCanvasTaskRunner.rerun(eq("canvas-1"), any()))
                .thenReturn(new AnalysisCanvasTaskRunner.Result(
                        "canvas-1",
                        "Weekly GMV",
                        12,
                        "Revenue increased",
                        "SELECT 1",
                        "Weekly GMV · 12 rows · Revenue increased"
                ));

        ScheduledTaskDto result = service.runNow("task-canvas");

        assertEquals("ok", result.lastRunStatus());
        assertEquals("Weekly GMV · 12 rows · Revenue increased", result.lastRunMessage());
        verify(analysisCanvasTaskRunner).rerun("canvas-1", Map.of());
        verify(taskStore).upsert(entry);
    }

    @Test
    void runNowPublishesInsightDigestWhenEnabled() {
        UserContext.set(9L, false, "session-1", "default");
        ScheduledTaskEntry entry = sqlTask("SELECT id FROM users");
        entry.setPayloadJson(
                "{\"sql\":\"SELECT id FROM users\",\"connectionId\":\"conn-1\",\"database\":\"app\",\"digest\":true,\"digestMaxRows\":1}"
        );
        when(taskStore.findById("task-1")).thenReturn(entry);
        when(sqlReviewService.review(any(SqlReviewRequest.class)))
                .thenReturn(new SqlReviewResultDto(true, false, List.of()));
        when(sqlService.execute(any(ExecuteSqlRequest.class))).thenReturn(new ExecuteSqlResult(
                "SELECT id FROM users",
                2,
                5L,
                List.of(Map.of("name", "id")),
                List.of(Map.of("id", 1), Map.of("id", 2)),
                null,
                null,
                null,
                false,
                null,
                null
        ));

        ScheduledTaskDto result = service.runNow("task-1");

        assertEquals("ok", result.lastRunStatus());
        verify(outboundNotifySupport).publish(
                eq(OutboundEventType.INSIGHT_DIGEST),
                argThat(data ->
                        "Nightly SQL".equals(data.get("name"))
                                && ScheduledTaskEntry.TYPE_SQL.equals(data.get("type"))
                                && Integer.valueOf(2).equals(data.get("rowCount"))
                                && List.of("id").equals(data.get("columns"))
                                && Boolean.TRUE.equals(data.get("truncated"))
                ),
                anyString(),
                eq(9L)
        );
    }

    @Test
    void runNowSkipsInsightDigestWhenDisabled() {
        UserContext.set(9L, false, "session-1", "default");
        ScheduledTaskEntry entry = sqlTask("SELECT 1");
        when(taskStore.findById("task-1")).thenReturn(entry);
        when(sqlReviewService.review(any(SqlReviewRequest.class)))
                .thenReturn(new SqlReviewResultDto(true, false, List.of()));
        when(sqlService.execute(any(ExecuteSqlRequest.class))).thenReturn(new ExecuteSqlResult(
                "SELECT 1",
                1,
                1L,
                List.of(Map.of("name", "c")),
                List.of(Map.of("c", 1)),
                null,
                null,
                null,
                false,
                null,
                null
        ));

        service.runNow("task-1");

        verify(outboundNotifySupport).publish(eq(OutboundEventType.SCHEDULED_TASK_OK), any(), eq(9L));
        verify(outboundNotifySupport, times(0)).publish(
                eq(OutboundEventType.INSIGHT_DIGEST),
                any(),
                anyString(),
                eq(9L)
        );
    }

    @Test
    void saveDataQualityAllowsBlankCronForGateOnly() {
        when(taskStore.upsert(any(ScheduledTaskEntry.class))).thenAnswer(inv -> inv.getArgument(0));

        ScheduledTaskDto saved = service.save(new SaveScheduledTaskRequest(
                null,
                "Gate only",
                ScheduledTaskEntry.TYPE_DATA_QUALITY,
                "",
                "{\"connectionId\":\"c1\",\"database\":\"db\",\"sql\":\"SELECT 1 WHERE 1=0\",\"assertion\":\"empty_result\",\"blocking\":true}",
                true
        ));

        assertNull(saved.cronExpression());
        assertEquals(ScheduledTaskEntry.TYPE_DATA_QUALITY, saved.type());
    }

    @Test
    void evaluateDataQualityGateFailsWhenBlockingRuleFails() {
        ScheduledTaskEntry blocking = new ScheduledTaskEntry();
        blocking.setId("dq-block");
        blocking.setName("No negatives");
        blocking.setType(ScheduledTaskEntry.TYPE_DATA_QUALITY);
        blocking.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
        blocking.setPayloadJson(
                "{\"connectionId\":\"conn-1\",\"database\":\"app\",\"sql\":\"SELECT id FROM orders WHERE amount < 0\","
                        + "\"assertion\":\"empty_result\",\"blocking\":true}"
        );
        ScheduledTaskEntry nonBlocking = new ScheduledTaskEntry();
        nonBlocking.setId("dq-soft");
        nonBlocking.setName("Soft check");
        nonBlocking.setType(ScheduledTaskEntry.TYPE_DATA_QUALITY);
        nonBlocking.setCreatedAt(Instant.parse("2026-01-02T00:00:00Z"));
        nonBlocking.setPayloadJson(
                "{\"connectionId\":\"conn-1\",\"database\":\"app\",\"sql\":\"SELECT 1 WHERE 1=0\","
                        + "\"assertion\":\"empty_result\",\"blocking\":false}"
        );
        when(taskStore.listAll()).thenReturn(List.of(blocking, nonBlocking));
        when(taskStore.findById("dq-block")).thenReturn(blocking);
        when(sqlReviewService.review(any(SqlReviewRequest.class)))
                .thenReturn(new SqlReviewResultDto(true, false, List.of()));
        when(sqlService.execute(any(ExecuteSqlRequest.class))).thenReturn(new ExecuteSqlResult(
                "SELECT id FROM orders WHERE amount < 0",
                1,
                3L,
                List.of(Map.of("name", "id")),
                List.of(Map.of("id", 9)),
                null,
                null,
                null,
                false,
                null,
                null
        ));

        DataQualityGateResultDto gate = service.evaluateDataQualityGate(
                new DataQualityGateRequest(null, "conn-1", "app", true, null, null, null)
        );

        assertFalse(gate.passed());
        assertEquals(1, gate.total());
        assertEquals(1, gate.failed());
        assertEquals("dq-block", gate.results().get(0).ruleId());
        assertTrue(gate.results().get(0).blocking());
        assertNull(gate.scopes());
    }

    @Test
    void evaluateDataQualityGateMultiEnvRequiresBothScopes() {
        ScheduledTaskEntry primary = new ScheduledTaskEntry();
        primary.setId("dq-prod");
        primary.setName("Prod check");
        primary.setType(ScheduledTaskEntry.TYPE_DATA_QUALITY);
        primary.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
        primary.setPayloadJson(
                "{\"connectionId\":\"conn-prod\",\"database\":\"app\",\"sql\":\"SELECT 1 WHERE 1=0\","
                        + "\"assertion\":\"empty_result\",\"blocking\":true}"
        );
        ScheduledTaskEntry staging = new ScheduledTaskEntry();
        staging.setId("dq-stg");
        staging.setName("Staging check");
        staging.setType(ScheduledTaskEntry.TYPE_DATA_QUALITY);
        staging.setCreatedAt(Instant.parse("2026-01-02T00:00:00Z"));
        staging.setPayloadJson(
                "{\"connectionId\":\"conn-stg\",\"database\":\"app\",\"sql\":\"SELECT id FROM t WHERE bad=1\","
                        + "\"assertion\":\"empty_result\",\"blocking\":true}"
        );
        when(taskStore.listAll()).thenReturn(List.of(primary, staging));
        when(taskStore.findById("dq-prod")).thenReturn(primary);
        when(taskStore.findById("dq-stg")).thenReturn(staging);
        when(sqlReviewService.review(any(SqlReviewRequest.class)))
                .thenReturn(new SqlReviewResultDto(true, false, List.of()));
        when(sqlService.execute(any(ExecuteSqlRequest.class))).thenAnswer(invocation -> {
            ExecuteSqlRequest req = invocation.getArgument(0);
            boolean fail = req.sql() != null && req.sql().contains("bad=1");
            return new ExecuteSqlResult(
                    req.sql(),
                    fail ? 1 : 0,
                    3L,
                    List.of(Map.of("name", "id")),
                    fail ? List.of(Map.of("id", 1)) : List.of(),
                    null,
                    null,
                    null,
                    false,
                    null,
                    null
            );
        });

        DataQualityGateResultDto gate = service.evaluateDataQualityGate(
                new DataQualityGateRequest(null, "conn-prod", "app", true, "conn-stg", "app", false)
        );

        assertFalse(gate.passed());
        assertEquals(2, gate.total());
        assertEquals(1, gate.failed());
        assertEquals(2, gate.scopes().size());
        assertTrue(gate.scopes().get(0).passed());
        assertEquals("conn-prod", gate.scopes().get(0).connectionId());
        assertFalse(gate.scopes().get(1).passed());
        assertEquals("conn-stg", gate.scopes().get(1).connectionId());
        assertNull(gate.pairs());
    }

    @Test
    void evaluateDataQualityGatePairsRulesByName() {
        ScheduledTaskEntry primary = new ScheduledTaskEntry();
        primary.setId("dq-prod");
        primary.setName("No negatives");
        primary.setType(ScheduledTaskEntry.TYPE_DATA_QUALITY);
        primary.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
        primary.setPayloadJson(
                "{\"connectionId\":\"conn-prod\",\"database\":\"app\",\"sql\":\"SELECT 1 WHERE 1=0\","
                        + "\"assertion\":\"empty_result\",\"blocking\":true}"
        );
        ScheduledTaskEntry stagingMatch = new ScheduledTaskEntry();
        stagingMatch.setId("dq-stg-match");
        stagingMatch.setName("No negatives");
        stagingMatch.setType(ScheduledTaskEntry.TYPE_DATA_QUALITY);
        stagingMatch.setCreatedAt(Instant.parse("2026-01-02T00:00:00Z"));
        stagingMatch.setPayloadJson(
                "{\"connectionId\":\"conn-stg\",\"database\":\"app\",\"sql\":\"SELECT 1 WHERE 1=0\","
                        + "\"assertion\":\"empty_result\",\"blocking\":true}"
        );
        ScheduledTaskEntry stagingExtra = new ScheduledTaskEntry();
        stagingExtra.setId("dq-stg-extra");
        stagingExtra.setName("Staging only");
        stagingExtra.setType(ScheduledTaskEntry.TYPE_DATA_QUALITY);
        stagingExtra.setCreatedAt(Instant.parse("2026-01-03T00:00:00Z"));
        stagingExtra.setPayloadJson(
                "{\"connectionId\":\"conn-stg\",\"database\":\"app\",\"sql\":\"SELECT id FROM t WHERE bad=1\","
                        + "\"assertion\":\"empty_result\",\"blocking\":true}"
        );
        when(taskStore.listAll()).thenReturn(List.of(primary, stagingMatch, stagingExtra));
        when(taskStore.findById("dq-prod")).thenReturn(primary);
        when(taskStore.findById("dq-stg-match")).thenReturn(stagingMatch);
        when(sqlReviewService.review(any(SqlReviewRequest.class)))
                .thenReturn(new SqlReviewResultDto(true, false, List.of()));
        when(sqlService.execute(any(ExecuteSqlRequest.class))).thenAnswer(invocation -> {
            ExecuteSqlRequest req = invocation.getArgument(0);
            return new ExecuteSqlResult(
                    req.sql(),
                    0,
                    3L,
                    List.of(Map.of("name", "id")),
                    List.of(),
                    null,
                    null,
                    null,
                    false,
                    null,
                    null
            );
        });

        DataQualityGateResultDto gate = service.evaluateDataQualityGate(
                new DataQualityGateRequest(null, "conn-prod", "app", true, "conn-stg", "app", true)
        );

        assertTrue(gate.passed());
        assertEquals(2, gate.total());
        assertEquals(0, gate.failed());
        assertEquals(1, gate.scopes().get(1).total());
        assertEquals("dq-stg-match", gate.scopes().get(1).results().get(0).ruleId());
        assertEquals(1, gate.pairs().size());
        assertTrue(gate.pairs().get(0).paired());
        assertEquals("dq-stg-match", gate.pairs().get(0).referenceRuleId());
    }

    @Test
    void evaluateDataQualityGateFailsWhenPairMissingOnReference() {
        ScheduledTaskEntry primary = new ScheduledTaskEntry();
        primary.setId("dq-prod");
        primary.setName("No negatives");
        primary.setType(ScheduledTaskEntry.TYPE_DATA_QUALITY);
        primary.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
        primary.setPayloadJson(
                "{\"connectionId\":\"conn-prod\",\"database\":\"app\",\"sql\":\"SELECT 1 WHERE 1=0\","
                        + "\"assertion\":\"empty_result\",\"blocking\":true}"
        );
        when(taskStore.listAll()).thenReturn(List.of(primary));
        when(taskStore.findById("dq-prod")).thenReturn(primary);
        when(sqlReviewService.review(any(SqlReviewRequest.class)))
                .thenReturn(new SqlReviewResultDto(true, false, List.of()));
        when(sqlService.execute(any(ExecuteSqlRequest.class))).thenAnswer(invocation -> {
            ExecuteSqlRequest req = invocation.getArgument(0);
            return new ExecuteSqlResult(
                    req.sql(),
                    0,
                    3L,
                    List.of(Map.of("name", "id")),
                    List.of(),
                    null,
                    null,
                    null,
                    false,
                    null,
                    null
            );
        });

        DataQualityGateResultDto gate = service.evaluateDataQualityGate(
                new DataQualityGateRequest(null, "conn-prod", "app", true, "conn-stg", "app", null)
        );

        assertFalse(gate.passed());
        assertEquals(1, gate.scopes().get(0).total());
        assertEquals(1, gate.scopes().get(1).failed());
        assertFalse(gate.pairs().get(0).paired());
        assertTrue(gate.scopes().get(1).results().get(0).ruleId().startsWith("unpaired:"));
    }

    @Test
    void runNowDataQualityFailsWhenAssertionFails() {
        UserContext.set(9L, false, "session-1", "default");
        ScheduledTaskEntry entry = new ScheduledTaskEntry();
        entry.setId("task-dq");
        entry.setName("Negative amounts");
        entry.setType(ScheduledTaskEntry.TYPE_DATA_QUALITY);
        entry.setCronExpression("0 0 * * * *");
        entry.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
        entry.setPayloadJson(
                "{\"connectionId\":\"conn-1\",\"database\":\"app\",\"sql\":\"SELECT id FROM orders WHERE amount < 0\","
                        + "\"assertion\":\"empty_result\",\"expected\":\"0\"}"
        );
        when(taskStore.findById("task-dq")).thenReturn(entry);
        when(sqlReviewService.review(any(SqlReviewRequest.class)))
                .thenReturn(new SqlReviewResultDto(true, false, List.of()));
        when(sqlService.execute(any(ExecuteSqlRequest.class))).thenReturn(new ExecuteSqlResult(
                "SELECT id FROM orders WHERE amount < 0",
                1,
                3L,
                List.of(Map.of("name", "id")),
                List.of(Map.of("id", 9)),
                null,
                null,
                null,
                false,
                null,
                null
        ));

        ScheduledTaskDto result = service.runNow("task-dq");

        assertEquals("failed", result.lastRunStatus());
        assertTrue(result.lastRunMessage().contains("DQ_ASSERTION_FAILED"));
        verify(outboundNotifySupport).publish(eq(OutboundEventType.DATA_QUALITY_FAILED), any(), eq(9L));
        verifyNoInteractions(analysisCanvasTaskRunner);
    }

    @Test
    void runNowHttpTriggerFailsOnNon2xx() throws Exception {
        UserContext.set(9L, false, "session-1", "default");
        com.sun.net.httpserver.HttpServer server =
                com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/fail", exchange -> {
            byte[] body = "boom".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(503, body.length);
            try (java.io.OutputStream os = exchange.getResponseBody()) {
                os.write(body);
            }
        });
        server.start();
        try {
            String url = "http://127.0.0.1:" + server.getAddress().getPort() + "/fail";
            ScheduledTaskEntry entry = new ScheduledTaskEntry();
            entry.setId("task-http");
            entry.setName("Trigger DAG");
            entry.setType(ScheduledTaskEntry.TYPE_HTTP_TRIGGER);
            entry.setCronExpression("0 0 * * * *");
            entry.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
            entry.setPayloadJson("{\"url\":\"" + url + "\",\"method\":\"POST\",\"bodyJson\":{}}");
            when(taskStore.findById("task-http")).thenReturn(entry);

            ScheduledTaskDto result = service.runNow("task-http");

            assertEquals("failed", result.lastRunStatus());
            assertTrue(result.lastRunMessage().contains("HTTP 503"));
            verify(outboundNotifySupport).publish(eq(OutboundEventType.ORCHESTRATION_FAILED), any(), eq(9L));
        } finally {
            server.stop(0);
        }
    }

    @Test
    void runNowStartsBackupPolicyRun() throws Exception {
        ScheduledTaskEntry entry = new ScheduledTaskEntry();
        entry.setId("task-backup");
        entry.setName("Nightly backup");
        entry.setType(ScheduledTaskEntry.TYPE_BACKUP);
        entry.setCronExpression("0 0 2 * * *");
        entry.setPayloadJson("{\"policyId\":\"pol-1\"}");
        when(taskStore.findById("task-backup")).thenReturn(entry);
        when(backupScheduleRunner.runScheduledPolicy("pol-1"))
                .thenReturn("backup run started: run-abc status=RUNNING");

        ScheduledTaskDto result = service.runNow("task-backup");

        assertEquals("ok", result.lastRunStatus());
        assertTrue(result.lastRunMessage().contains("run-abc"));
        verify(backupScheduleRunner).runScheduledPolicy("pol-1");
    }

    private static ScheduledTaskEntry canvasTask(String canvasId) {
        ScheduledTaskEntry entry = new ScheduledTaskEntry();
        entry.setId("task-canvas");
        entry.setName("Weekly analysis");
        entry.setType(ScheduledTaskEntry.TYPE_CANVAS);
        entry.setCronExpression("0 0 * * MON");
        entry.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
        entry.setPayloadJson("{\"canvasId\":\"" + canvasId + "\"}");
        return entry;
    }

    private static ScheduledTaskEntry sqlTask(String sql) {
        ScheduledTaskEntry entry = new ScheduledTaskEntry();
        entry.setId("task-1");
        entry.setName("Nightly SQL");
        entry.setType(ScheduledTaskEntry.TYPE_SQL);
        entry.setCronExpression("0 0 * * * *");
        entry.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
        entry.setPayloadJson("{\"sql\":\"" + sql + "\",\"connectionId\":\"conn-1\",\"database\":\"app\"}");
        return entry;
    }
}