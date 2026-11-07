package org.apache.datawise.backend.platform.schedule;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.pack.AnalysisCanvasTaskRunner;
import org.apache.datawise.backend.common.pack.BackupScheduleRunner;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.configstore.ScheduledTaskStore;
import org.apache.datawise.backend.database.drift.SchemaDriftService;
import org.apache.datawise.backend.database.sql.SqlReviewService;
import org.apache.datawise.backend.database.sql.SqlService;
import org.apache.datawise.backend.domain.DataQualityGateRequest;
import org.apache.datawise.backend.domain.DataQualityGateResultDto;
import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.OrchestrationStatusDto;
import org.apache.datawise.backend.domain.SaveScheduledTaskRequest;
import org.apache.datawise.backend.domain.ScheduledTaskDto;
import org.apache.datawise.backend.domain.SqlReviewRequest;
import org.apache.datawise.backend.domain.SqlReviewResultDto;
import org.apache.datawise.backend.configstore.UserScheduledTaskStore.OwnedScheduledTask;
import org.apache.datawise.backend.model.ScheduledTaskEntry;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.InstanceWorkspaceService;
import org.apache.datawise.backend.service.TeamService;
import org.apache.datawise.backend.service.outbound.OutboundNotifySupport;
import org.apache.datawise.backend.service.workspace.WorkspaceNotificationService;
import org.apache.datawise.backend.connector.api.support.SqlWriteClassifier;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import jakarta.annotation.PreDestroy;

@Service
public class ScheduledTaskService {

    private static final Logger log = LoggerFactory.getLogger(ScheduledTaskService.class);
    private static final AtomicInteger WORKER_SEQ = new AtomicInteger();
    private static final int WORKER_POOL_SIZE = Math.max(2, Math.min(8, Runtime.getRuntime().availableProcessors()));

    private final ScheduledTaskStore taskStore;
    private final SqlService sqlService;
    private final SqlReviewService sqlReviewService;
    private final SchemaDriftService schemaDriftService;
    private final AnalysisCanvasTaskRunner analysisCanvasTaskRunner;
    private final TeamService teamService;
    private final InstanceWorkspaceService instanceWorkspaceService;
    private final WorkspaceNotificationService notificationService;
    private final OutboundNotifySupport outboundNotifySupport;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final ObjectProvider<BackupScheduleRunner> backupScheduleRunner;
    /** Runs due tasks off the Spring single-thread scheduler so one slow backup cannot stall the fleet. */
    private final ExecutorService taskExecutor = Executors.newFixedThreadPool(
            WORKER_POOL_SIZE,
            r -> {
                Thread thread = new Thread(r, "scheduled-task-" + WORKER_SEQ.incrementAndGet());
                thread.setDaemon(true);
                return thread;
            }
    );

    public ScheduledTaskService(
            ScheduledTaskStore taskStore,
            SqlService sqlService,
            SqlReviewService sqlReviewService,
            SchemaDriftService schemaDriftService,
            ObjectProvider<AnalysisCanvasTaskRunner> analysisCanvasTaskRunner,
            TeamService teamService,
            InstanceWorkspaceService instanceWorkspaceService,
            WorkspaceNotificationService notificationService,
            OutboundNotifySupport outboundNotifySupport,
            ObjectMapper objectMapper,
            ObjectProvider<BackupScheduleRunner> backupScheduleRunner
    ) {
        this.taskStore = taskStore;
        this.sqlService = sqlService;
        this.sqlReviewService = sqlReviewService;
        this.schemaDriftService = schemaDriftService;
        this.analysisCanvasTaskRunner = analysisCanvasTaskRunner.getIfAvailable();
        this.teamService = teamService;
        this.instanceWorkspaceService = instanceWorkspaceService;
        this.notificationService = notificationService;
        this.outboundNotifySupport = outboundNotifySupport;
        this.objectMapper = objectMapper;
        this.backupScheduleRunner = backupScheduleRunner;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    public List<ScheduledTaskDto> list() {
        return taskStore.listAll().stream()
                .sorted(Comparator.comparing(ScheduledTaskEntry::getCreatedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toDto)
                .toList();
    }

    public ScheduledTaskDto save(SaveScheduledTaskRequest request) {
        if (request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException("name is required");
        }
        String type = request.type() != null ? request.type().trim() : ScheduledTaskEntry.TYPE_SQL;
        String cron = request.cronExpression() != null ? request.cronExpression().trim() : "";
        boolean gateOnlyDq = ScheduledTaskEntry.TYPE_DATA_QUALITY.equals(type) && cron.isEmpty();
        if (!gateOnlyDq) {
            if (cron.isEmpty()) {
                throw new IllegalArgumentException("cronExpression is required");
            }
            validateCron(cron);
        }

        ScheduledTaskEntry entry = request.id() != null && !request.id().isBlank()
                ? requireEntry(request.id())
                : new ScheduledTaskEntry();
        if (entry.getId() == null) {
            entry.setId(IdGenerator.shortId("task-"));
            entry.setCreatedAt(Instant.now());
        }
        entry.setName(request.name().trim());
        entry.setType(type);
        entry.setCronExpression(gateOnlyDq ? null : cron);
        entry.setPayloadJson(trimOrNull(request.payloadJson()));
        if (request.enabled() != null) {
            entry.setEnabled(request.enabled());
        }
        taskStore.upsert(entry);
        return toDto(entry);
    }

    /** Catalog view: {@code data_quality} tasks, optionally scoped by connection/database in payload. */
    public List<ScheduledTaskDto> listDataQualityRules(String connectionId, String database) {
        return taskStore.listAll().stream()
                .filter(entry -> ScheduledTaskEntry.TYPE_DATA_QUALITY.equals(entry.getType()))
                .filter(entry -> DataQualityGateSupport.matchesDqScope(entry, connectionId, database, objectMapper))
                .sorted(Comparator.comparing(ScheduledTaskEntry::getCreatedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toDto)
                .toList();
    }

    /**
     * Release gate: run matching DQ rules and return aggregate pass/fail.
     * Each rule still updates last-run status and emits outbound webhooks.
     * <p>
     * When {@code referenceConnectionId} is set, also evaluates a second suite.
     * With {@code pairByName} (default true for multi-env), reference runs rules that
     * share names with the primary suite; unpaired primary names fail the reference scope.
     * With {@code pairByName=false}, reference runs its own blocking suite (legacy).
     */
    public DataQualityGateResultDto evaluateDataQualityGate(DataQualityGateRequest request) {
        return DataQualityGateSupport.evaluate(
                request,
                taskStore.listAll(),
                objectMapper,
                entry -> {
                    executeTask(entry);
                    taskStore.upsert(entry);
                }
        );
    }

    public void delete(String id) {
        requireEntry(id);
        taskStore.removeById(id);
    }

    public ScheduledTaskDto runNow(String id) {
        ScheduledTaskEntry entry = requireEntry(id);
        executeTask(entry);
        taskStore.upsert(entry);
        return toDto(entry);
    }

    /**
     * Poll remote DAG/job status for an {@code http_trigger} task using {@code statusUrl}
     * or {@code statusUrlTemplate} from the payload (same auth headers as the trigger).
     */
    public OrchestrationStatusDto pollOrchestrationStatus(String taskId) {
        if (taskId == null || taskId.isBlank()) {
            throw new IllegalArgumentException("taskId is required");
        }
        ScheduledTaskEntry entry = requireEntry(taskId.trim());
        if (!ScheduledTaskEntry.TYPE_HTTP_TRIGGER.equals(entry.getType())) {
            throw new IllegalArgumentException("task is not http_trigger: " + entry.getType());
        }
        try {
            JsonNode payload = parsePayload(entry.getPayloadJson());
            OrchestrationStatusDto status = ScheduledHttpTriggerSupport.pollStatus(
                    entry,
                    payload,
                    objectMapper,
                    httpClient
            );
            taskStore.upsert(entry);
            return status;
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException(
                    ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName(),
                    ex
            );
        }
    }

    public void runDueTasks() {
        Instant now = Instant.now();
        for (OwnedScheduledTask owned : taskStore.listAllAcrossUsers()) {
            ScheduledTaskEntry entry = owned.entry();
            if (!entry.isEnabled() || !isDue(entry, now)) {
                continue;
            }
            Long userId = owned.userId();
            String tenantId = owned.tenantId();
            UserContext.Snapshot ownerSnapshot = new UserContext.Snapshot(
                    userId,
                    false,
                    "scheduled-task:" + entry.getId(),
                    null,
                    tenantId
            );
            // Claim under owner context (store upsert requires registered userId).
            entry.setLastRunAt(now);
            entry.setLastRunStatus("running");
            UserContext.runAs(ownerSnapshot, () -> taskStore.upsertForUser(userId, entry));
            try {
                taskExecutor.execute(() -> UserContext.runAs(
                        ownerSnapshot,
                        () -> {
                            executeTask(entry);
                            taskStore.upsertForUser(userId, entry);
                        }
                ));
            } catch (RejectedExecutionException ex) {
                entry.setLastRunStatus("failed");
                entry.setLastRunMessage("task executor saturated");
                UserContext.runAs(ownerSnapshot, () -> taskStore.upsertForUser(userId, entry));
                log.warn("Scheduled task executor saturated; deferred taskId={}", entry.getId());
            }
        }
    }

    @PreDestroy
    void shutdownTaskExecutor() {
        taskExecutor.shutdownNow();
        try {
            if (!taskExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                log.debug("Scheduled task executor did not terminate within 5s");
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }

    private void executeTask(ScheduledTaskEntry entry) {
        Instant started = Instant.now();
        entry.setLastRunAt(started);
        try {
            TaskRunOutcome outcome = switch (entry.getType()) {
                case ScheduledTaskEntry.TYPE_SQL -> runSqlTask(entry);
                case ScheduledTaskEntry.TYPE_CANVAS -> runCanvasTask(entry);
                case ScheduledTaskEntry.TYPE_SCHEMA_DRIFT -> {
                    runSchemaDriftTask(entry);
                    yield TaskRunOutcome.messageOnly("completed");
                }
                case ScheduledTaskEntry.TYPE_DATA_QUALITY -> runDataQualityTask(entry);
                case ScheduledTaskEntry.TYPE_HTTP_TRIGGER -> runHttpTriggerTask(entry);
                case ScheduledTaskEntry.TYPE_BACKUP -> runBackupTask(entry);
                default -> throw new IllegalArgumentException("unsupported task type: " + entry.getType());
            };
            entry.setLastRunStatus("ok");
            entry.setLastRunMessage(outcome.message());
            pushTaskNotification(entry, true, null, outcome.digest());
        } catch (Exception ex) {
            if (ex instanceof InterruptedException || ex.getCause() instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            entry.setLastRunStatus("failed");
            String message = ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName();
            entry.setLastRunMessage(message);
            pushTaskNotification(entry, false, message, null);
        }
    }

    private void pushTaskNotification(
            ScheduledTaskEntry entry,
            boolean ok,
            String errorMessage,
            Map<String, Object> digest
    ) {
        ScheduledTaskNotifySupport.notifyRun(
                log,
                notificationService,
                outboundNotifySupport,
                entry,
                ok,
                errorMessage,
                digest
        );
    }

    private TaskRunOutcome runSqlTask(ScheduledTaskEntry entry) throws Exception {
        JsonNode payload = parsePayload(entry.getPayloadJson());
        ScheduledSqlPayloadSupport.ResolvedSql resolved = ScheduledSqlPayloadSupport.resolve(
                payload,
                instanceWorkspaceService,
                teamService
        );
        List<String> statements = ScheduledSqlPayloadSupport.splitExecutableStatements(resolved.sql());
        if (statements.isEmpty()) {
            throw new IllegalArgumentException("SQL is empty");
        }
        int maxRows = payload.has("maxRows") ? payload.get("maxRows").asInt(1000) : 1000;
        boolean digest = payload.path("digest").asBoolean(false);
        int digestMaxRows = ScheduledTaskDigestSupport.resolveDigestMaxRows(payload);
        int executed = 0;
        ExecuteSqlResult lastResult = null;
        for (String statement : statements) {
            SqlReviewResultDto review = sqlReviewService.review(
                    new SqlReviewRequest(statement, resolved.connectionId(), resolved.database())
            );
            if (!review.allowed()) {
                throw new IllegalArgumentException("SQL blocked by review: " + review.findings());
            }
            if (review.requiresApproval()) {
                throw new IllegalArgumentException("SQL requires production approval");
            }
            ExecuteSqlRequest request = new ExecuteSqlRequest(
                    statement,
                    resolved.connectionId(),
                    resolved.database(),
                    maxRows,
                    null,
                    null,
                    null,
                    "scheduled-task"
            );
            lastResult = sqlService.execute(request);
            recordTeamSqlAudit(request);
            executed += 1;
        }
        String message = "completed " + executed + " statement(s) via " + resolved.source();
        if (!digest || lastResult == null) {
            return TaskRunOutcome.messageOnly(message);
        }
        return new TaskRunOutcome(message, ScheduledTaskDigestSupport.buildSqlDigest(lastResult, digestMaxRows));
    }

    private void recordTeamSqlAudit(ExecuteSqlRequest request) {
        String sql = request.sql();
        if (sql == null || sql.isBlank() || !SqlWriteClassifier.requiresWriteAccess(sql)) {
            return;
        }
        String action = SqlWriteClassifier.requiresDangerousSqlConfirmation(sql)
                ? "sql.dangerous"
                : "sql.write";
        try {
            teamService.recordSqlExecutionAudit(action, request.connectionId(), request.database(), sql);
        } catch (RuntimeException ex) {
            ExceptionLogging.warn(log, "scheduledTask.sqlAudit connectionId=" + request.connectionId()
                    + " database=" + request.database(), ex);
            throw new IllegalStateException("SQL_AUDIT_FAILED", ex);
        }
    }

    private TaskRunOutcome runCanvasTask(ScheduledTaskEntry entry) throws Exception {
        if (analysisCanvasTaskRunner == null) {
            throw new IllegalStateException("Analysis canvas tasks require the AI module (pack.ai)");
        }
        JsonNode payload = parsePayload(entry.getPayloadJson());
        String canvasId = text(payload, "canvasId");
        Map<String, String> parameterValues = readStringMap(payload.get("parameterValues"));
        boolean digest = payload.path("digest").asBoolean(false);
        AnalysisCanvasTaskRunner.Result result = analysisCanvasTaskRunner.rerun(canvasId, parameterValues);
        String message = result.statusMessage();
        if (!digest) {
            return TaskRunOutcome.messageOnly(message);
        }
        int digestMaxRows = ScheduledTaskDigestSupport.resolveDigestMaxRows(payload);
        return new TaskRunOutcome(
                message,
                ScheduledTaskDigestSupport.buildCanvasDigest(
                        result.canvasId() != null ? result.canvasId() : canvasId,
                        result.title(),
                        result.rowCount(),
                        result.summary(),
                        result.sql(),
                        digestMaxRows
                )
        );
    }

    private record TaskRunOutcome(String message, Map<String, Object> digest) {
        static TaskRunOutcome messageOnly(String message) {
            return new TaskRunOutcome(message, null);
        }
    }

    private static Map<String, String> readStringMap(JsonNode node) {
        if (node == null || !node.isObject()) {
            return Map.of();
        }
        Map<String, String> values = new LinkedHashMap<>();
        node.fields().forEachRemaining(field -> {
            if (field.getValue() != null && !field.getValue().isNull()) {
                values.put(field.getKey(), field.getValue().asText(""));
            }
        });
        return values;
    }

    private void runSchemaDriftTask(ScheduledTaskEntry entry) throws Exception {
        JsonNode payload = parsePayload(entry.getPayloadJson());
        String monitorId = text(payload, "monitorId");
        schemaDriftService.runMonitor(monitorId);
    }

    private TaskRunOutcome runDataQualityTask(ScheduledTaskEntry entry) throws Exception {
        JsonNode payload = parsePayload(entry.getPayloadJson());
        String connectionId = text(payload, "connectionId");
        String database = text(payload, "database");
        String sql = text(payload, "sql");
        if (SqlWriteClassifier.requiresWriteAccess(sql)) {
            throw new IllegalArgumentException("DQ rules must be read-only SELECT statements");
        }
        String assertion = payload.has("assertion") && !payload.get("assertion").isNull()
                ? payload.get("assertion").asText("empty_result").trim()
                : DataQualityAssertionSupport.EMPTY_RESULT;
        String expected = payload.has("expected") && !payload.get("expected").isNull()
                ? payload.get("expected").asText("")
                : "0";
        String column = payload.has("column") && !payload.get("column").isNull()
                ? payload.get("column").asText(null)
                : null;
        int maxRows = payload.has("maxRows") ? payload.get("maxRows").asInt(1000) : 1000;

        SqlReviewResultDto review = sqlReviewService.review(new SqlReviewRequest(sql, connectionId, database));
        if (!review.allowed()) {
            throw new IllegalArgumentException("SQL blocked by review: " + review.findings());
        }
        if (review.requiresApproval()) {
            throw new IllegalArgumentException("SQL requires production approval");
        }

        ExecuteSqlRequest request = new ExecuteSqlRequest(
                sql,
                connectionId,
                database,
                maxRows,
                null,
                null,
                null,
                "data-quality"
        );
        ExecuteSqlResult result = sqlService.execute(request);
        DataQualityAssertionSupport.evaluate(result, assertion, expected, column);

        Map<String, Object> digest = new LinkedHashMap<>();
        digest.put("assertion", assertion);
        digest.put("expected", expected);
        digest.put("rowCount", result.rowCount());
        if (column != null && !column.isBlank()) {
            digest.put("column", column);
        }
        return new TaskRunOutcome(
                "DQ ok: " + assertion + " (rowCount=" + result.rowCount() + ")",
                digest
        );
    }

    private TaskRunOutcome runBackupTask(ScheduledTaskEntry entry) throws Exception {
        JsonNode payload = parsePayload(entry.getPayloadJson());
        String policyId = text(payload, "policyId");
        BackupScheduleRunner runner = backupScheduleRunner.getIfAvailable();
        if (runner == null) {
            throw new IllegalStateException("Backup engine is not installed (datawise-backup / pack.backup)");
        }
        return TaskRunOutcome.messageOnly(runner.runScheduledPolicy(policyId));
    }

    private TaskRunOutcome runHttpTriggerTask(ScheduledTaskEntry entry) throws Exception {
        JsonNode payload = parsePayload(entry.getPayloadJson());
        ScheduledHttpTriggerSupport.Outcome outcome = ScheduledHttpTriggerSupport.run(
                entry,
                payload,
                objectMapper,
                httpClient
        );
        return new TaskRunOutcome(outcome.message(), outcome.digest());
    }

    private static boolean isDue(ScheduledTaskEntry entry, Instant now) {
        if (entry.getCronExpression() == null || entry.getCronExpression().isBlank()) {
            return false;
        }
        try {
            CronExpression cron = CronExpression.parse(entry.getCronExpression());
            Instant base = entry.getLastRunAt() != null ? entry.getLastRunAt() : entry.getCreatedAt();
            if (base == null) {
                base = now.minusSeconds(3600);
            }
            Instant next = cron.next(base);
            return next != null && !next.isAfter(now);
        } catch (Exception ex) {
            log.warn(
                    "Invalid cron on scheduled task id={} cron={}: {}",
                    entry.getId(),
                    entry.getCronExpression(),
                    ex.toString()
            );
            return false;
        }
    }

    private JsonNode parsePayload(String payloadJson) throws Exception {
        if (payloadJson == null || payloadJson.isBlank()) {
            throw new IllegalArgumentException("payloadJson is required");
        }
        return objectMapper.readTree(payloadJson);
    }

    private static String text(JsonNode node, String field) {
        if (!node.has(field) || node.get(field).isNull()) {
            throw new IllegalArgumentException(field + " is required in payload");
        }
        String value = node.get(field).asText("").trim();
        if (value.isEmpty()) {
            throw new IllegalArgumentException(field + " is required in payload");
        }
        return value;
    }

    private ScheduledTaskEntry requireEntry(String id) {
        ScheduledTaskEntry entry = taskStore.findById(id);
        if (entry == null) {
            throw new IllegalArgumentException("task not found: " + id);
        }
        return entry;
    }

    private static void validateCron(String cron) {
        try {
            CronExpression.parse(cron);
        } catch (Exception ex) {
            throw new IllegalArgumentException("invalid cron expression: " + cron);
        }
    }

    private ScheduledTaskDto toDto(ScheduledTaskEntry entry) {
        return new ScheduledTaskDto(
                entry.getId(),
                entry.getName(),
                entry.getType(),
                entry.getCronExpression(),
                entry.getPayloadJson(),
                entry.isEnabled(),
                entry.getLastRunAt(),
                entry.getLastRunStatus(),
                entry.getLastRunMessage(),
                entry.getCreatedAt(),
                entry.getOrchestrationState(),
                entry.getOrchestrationRef(),
                entry.getOrchestrationCheckedAt(),
                entry.getOrchestrationDetail()
        );
    }

    private static String trimOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

@Component
@EnableScheduling
class ScheduledTaskRunner {

    private final ScheduledTaskService scheduledTaskService;

    ScheduledTaskRunner(ScheduledTaskService scheduledTaskService) {
        this.scheduledTaskService = scheduledTaskService;
    }

    @Scheduled(fixedDelayString = "${datawise.platform.scheduled-tasks.poll-ms:60000}")
    void pollDueTasks() {
        scheduledTaskService.runDueTasks();
    }
}
