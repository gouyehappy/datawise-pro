package org.apache.datawise.backend.sync.job;

import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TenantConcurrencyKeys;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.config.TaskConcurrencyProperties;
import org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest;
import org.apache.datawise.taskconcurrency.model.TenantSlotPolicy;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Enqueues migration jobs into the task-concurrency pool and ensures per-product-tenant policies exist.
 */
@Component
public class MigrationTaskAdmissionService {

    private static final Logger log = LoggerFactory.getLogger(MigrationTaskAdmissionService.class);

    private final int tenantSlots;
    private final PriorityPolicy priorityPolicy;
    private final boolean admissionLogEnabled;

    @Autowired
    public MigrationTaskAdmissionService(
            @Value("${datawise.migration.task-concurrency-tenant-slots:2}") int tenantSlots,
            @Value("${datawise.migration.task-concurrency-default-priority:5}") int defaultPriority,
            @Value("${datawise.migration.task-concurrency-admission-log-enabled:true}") boolean admissionLogEnabled,
            @Value("${datawise.migration.task-concurrency-priority.small-table-threshold:1}") int smallTableThreshold,
            @Value("${datawise.migration.task-concurrency-priority.medium-table-threshold:3}") int mediumTableThreshold,
            @Value("${datawise.migration.task-concurrency-priority.large-table-threshold:5}") int largeTableThreshold,
            @Value("${datawise.migration.task-concurrency-priority.huge-table-threshold:10}") int hugeTableThreshold,
            @Value("${datawise.migration.task-concurrency-priority.small-table-bonus:2}") int smallTableBonus,
            @Value("${datawise.migration.task-concurrency-priority.medium-table-bonus:1}") int mediumTableBonus,
            @Value("${datawise.migration.task-concurrency-priority.large-table-penalty:1}") int largeTablePenalty,
            @Value("${datawise.migration.task-concurrency-priority.huge-table-penalty:2}") int hugeTablePenalty,
            @Value("${datawise.migration.task-concurrency-priority.resume-bonus:2}") int resumeBonus,
            @Value("${datawise.migration.task-concurrency-priority.small-batch-threshold:200}") int smallBatchThreshold,
            @Value("${datawise.migration.task-concurrency-priority.large-batch-threshold:2000}") int largeBatchThreshold,
            @Value("${datawise.migration.task-concurrency-priority.small-batch-bonus:1}") int smallBatchBonus,
            @Value("${datawise.migration.task-concurrency-priority.large-batch-penalty:1}") int largeBatchPenalty,
            @Value("${datawise.migration.task-concurrency-priority.throttle-penalty:1}") int throttlePenalty) {
        this(
                tenantSlots,
                admissionLogEnabled,
                new PriorityPolicy(
                        defaultPriority,
                        smallTableThreshold, mediumTableThreshold, largeTableThreshold, hugeTableThreshold,
                        smallTableBonus, mediumTableBonus, largeTablePenalty, hugeTablePenalty,
                        resumeBonus,
                        smallBatchThreshold, largeBatchThreshold,
                        smallBatchBonus, largeBatchPenalty,
                        throttlePenalty
                )
        );
    }

    MigrationTaskAdmissionService(int tenantSlots, int defaultPriority) {
        this(tenantSlots, false, PriorityPolicy.defaults(defaultPriority));
    }

    MigrationTaskAdmissionService(int tenantSlots, PriorityPolicy priorityPolicy) {
        this(tenantSlots, false, priorityPolicy);
    }

    MigrationTaskAdmissionService(int tenantSlots, boolean admissionLogEnabled, PriorityPolicy priorityPolicy) {
        this.tenantSlots = Math.max(1, tenantSlots);
        this.priorityPolicy = priorityPolicy;
        this.admissionLogEnabled = admissionLogEnabled;
    }

    public void enqueue(
            long userId,
            String productTenantId,
            String jobId,
            TableMigrationBatchRequest request,
            TaskConcurrencyController controller) {
        int slotTenantId = toSlotTenantId(productTenantId);
        ensureTenantPolicy(controller, slotTenantId);
        int priority = resolvePriority(request);
        if (admissionLogEnabled && log.isInfoEnabled()) {
            int tableCount = request != null && request.tables() != null ? request.tables().size() : 0;
            Integer batchSize = request != null ? request.batchSize() : null;
            Integer throttleMs = request != null ? request.throttleMs() : null;
            boolean resume = request != null && request.resumeJobId() != null && !request.resumeJobId().isBlank();
            log.info(
                    "migration.task.admit jobId={} userId={} productTenantId={} slotTenantId={} priority={} tables={} batchSize={} throttleMs={} resume={}",
                    jobId,
                    userId,
                    TenantIds.normalizeOrDefault(productTenantId),
                    slotTenantId,
                    priority,
                    tableCount,
                    batchSize,
                    throttleMs,
                    resume
            );
        }
        controller.enqueue(TaskAdmissionRequest.builder()
                .taskId(jobId)
                .tenantId(slotTenantId)
                .priority(priority)
                .build());
    }

    /** @deprecated 使用 {@link #enqueue(long, String, String, TableMigrationBatchRequest, TaskConcurrencyController)} */
    @Deprecated
    public void enqueue(
            long userId,
            String jobId,
            TableMigrationBatchRequest request,
            TaskConcurrencyController controller) {
        enqueue(userId, TenantIds.DEFAULT, jobId, request, controller);
    }

    static int toSlotTenantId(String productTenantId) {
        return TenantConcurrencyKeys.toSlotKey(productTenantId);
    }

    /** @deprecated 历史按 userId 作为 slot；保留供旧测试对照。 */
    @Deprecated
    static int toTenantId(long userId) {
        if (userId <= 0L || userId > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("userId out of task-concurrency tenant range: " + userId);
        }
        return (int) userId;
    }

    private void ensureTenantPolicy(TaskConcurrencyController controller, int tenantId) {
        if (controller.getTenantPolicy(tenantId).isPresent()) {
            return;
        }
        int slots = tenantSlots;
        controller.upsertTenantPolicy(TenantSlotPolicy.builder()
                .tenantId(tenantId)
                .allocatedSlots(slots)
                .reservedSlots(Math.min(1, slots))
                .maxConcurrent(slots)
                .enabled(true)
                .build());
    }

    int resolvePriority(TableMigrationBatchRequest request) {
        int priority = priorityPolicy.defaultPriority;
        if (request == null) {
            return clampPriority(priority);
        }
        int tableCount = request.tables() == null ? 0 : request.tables().size();
        if (tableCount <= priorityPolicy.smallTableThreshold) {
            priority += priorityPolicy.smallTableBonus;
        } else if (tableCount <= priorityPolicy.mediumTableThreshold) {
            priority += priorityPolicy.mediumTableBonus;
        } else if (tableCount >= priorityPolicy.hugeTableThreshold) {
            priority -= priorityPolicy.hugeTablePenalty;
        } else if (tableCount >= priorityPolicy.largeTableThreshold) {
            priority -= priorityPolicy.largeTablePenalty;
        }
        if (request.resumeJobId() != null && !request.resumeJobId().isBlank()) {
            priority += priorityPolicy.resumeBonus;
        }
        Integer batchSize = request.batchSize();
        if (batchSize != null) {
            if (batchSize <= priorityPolicy.smallBatchThreshold) {
                priority += priorityPolicy.smallBatchBonus;
            } else if (batchSize >= priorityPolicy.largeBatchThreshold) {
                priority -= priorityPolicy.largeBatchPenalty;
            }
        }
        Integer throttleMs = request.throttleMs();
        if (throttleMs != null && throttleMs > 0) {
            priority -= priorityPolicy.throttlePenalty;
        }
        return clampPriority(priority);
    }

    private static int clampPriority(int priority) {
        return Math.max(TaskConcurrencyProperties.MIN_PRIORITY, Math.min(TaskConcurrencyProperties.MAX_PRIORITY, priority));
    }

    static final class PriorityPolicy {
        final int defaultPriority;
        final int smallTableThreshold;
        final int mediumTableThreshold;
        final int largeTableThreshold;
        final int hugeTableThreshold;
        final int smallTableBonus;
        final int mediumTableBonus;
        final int largeTablePenalty;
        final int hugeTablePenalty;
        final int resumeBonus;
        final int smallBatchThreshold;
        final int largeBatchThreshold;
        final int smallBatchBonus;
        final int largeBatchPenalty;
        final int throttlePenalty;

        PriorityPolicy(
                int defaultPriority,
                int smallTableThreshold, int mediumTableThreshold, int largeTableThreshold, int hugeTableThreshold,
                int smallTableBonus, int mediumTableBonus, int largeTablePenalty, int hugeTablePenalty,
                int resumeBonus,
                int smallBatchThreshold, int largeBatchThreshold,
                int smallBatchBonus, int largeBatchPenalty,
                int throttlePenalty
        ) {
            this.defaultPriority = clampPriority(defaultPriority);
            this.smallTableThreshold = Math.max(0, smallTableThreshold);
            this.mediumTableThreshold = Math.max(this.smallTableThreshold, mediumTableThreshold);
            this.largeTableThreshold = Math.max(this.mediumTableThreshold + 1, largeTableThreshold);
            this.hugeTableThreshold = Math.max(this.largeTableThreshold + 1, hugeTableThreshold);
            this.smallTableBonus = Math.max(0, smallTableBonus);
            this.mediumTableBonus = Math.max(0, mediumTableBonus);
            this.largeTablePenalty = Math.max(0, largeTablePenalty);
            this.hugeTablePenalty = Math.max(0, hugeTablePenalty);
            this.resumeBonus = Math.max(0, resumeBonus);
            this.smallBatchThreshold = Math.max(1, smallBatchThreshold);
            this.largeBatchThreshold = Math.max(this.smallBatchThreshold + 1, largeBatchThreshold);
            this.smallBatchBonus = Math.max(0, smallBatchBonus);
            this.largeBatchPenalty = Math.max(0, largeBatchPenalty);
            this.throttlePenalty = Math.max(0, throttlePenalty);
        }

        static PriorityPolicy defaults(int defaultPriority) {
            return new PriorityPolicy(
                    defaultPriority,
                    1, 3, 5, 10,
                    2, 1, 1, 2,
                    2,
                    200, 2000,
                    1, 1,
                    1
            );
        }
    }
}
