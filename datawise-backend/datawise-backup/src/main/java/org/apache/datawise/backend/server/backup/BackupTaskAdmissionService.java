package org.apache.datawise.backend.server.backup;

import org.apache.datawise.backend.config.BackupProperties;
import org.apache.datawise.backend.domain.TenantConcurrencyKeys;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.config.TaskConcurrencyProperties;
import org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest;
import org.apache.datawise.taskconcurrency.model.TenantSlotPolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Enqueues backup / restore jobs into the shared {@link TaskConcurrencyController} pool
 * (same admission path as migration).
 */
@Component
public class BackupTaskAdmissionService {

    private static final Logger log = LoggerFactory.getLogger(BackupTaskAdmissionService.class);

    /** Manual / API backup runs — slightly above default migration priority. */
    public static final int PRIORITY_BACKUP_RUN = 6;
    /** Restore jobs — prefer over background backup. */
    public static final int PRIORITY_RESTORE = 7;

    private final BackupProperties backupProperties;

    public BackupTaskAdmissionService(BackupProperties backupProperties) {
        this.backupProperties = backupProperties;
    }

    public void enqueueBackupRun(String productTenantId, String runId, TaskConcurrencyController controller) {
        enqueue(productTenantId, runId, PRIORITY_BACKUP_RUN, controller);
    }

    public void enqueueRestore(String productTenantId, String jobId, TaskConcurrencyController controller) {
        enqueue(productTenantId, jobId, PRIORITY_RESTORE, controller);
    }

    private void enqueue(
            String productTenantId,
            String taskId,
            int priority,
            TaskConcurrencyController controller
    ) {
        int slotTenantId = TenantConcurrencyKeys.toSlotKey(productTenantId);
        ensureTenantPolicy(controller, slotTenantId);
        int clamped = clampPriority(priority);
        log.info(
                "backup.task.admit taskId={} productTenantId={} slotTenantId={} priority={}",
                taskId,
                TenantIds.normalizeOrDefault(productTenantId),
                slotTenantId,
                clamped
        );
        controller.enqueue(TaskAdmissionRequest.builder()
                .taskId(taskId)
                .tenantId(slotTenantId)
                .priority(clamped)
                .build());
    }

    private void ensureTenantPolicy(TaskConcurrencyController controller, int tenantId) {
        if (controller.getTenantPolicy(tenantId).isPresent()) {
            return;
        }
        int slots = Math.max(1, backupProperties.getMaxConcurrentRuns());
        controller.upsertTenantPolicy(TenantSlotPolicy.builder()
                .tenantId(tenantId)
                .allocatedSlots(slots)
                .reservedSlots(Math.min(1, slots))
                .maxConcurrent(slots)
                .enabled(true)
                .build());
    }

    private static int clampPriority(int priority) {
        return Math.max(
                TaskConcurrencyProperties.MIN_PRIORITY,
                Math.min(TaskConcurrencyProperties.MAX_PRIORITY, priority)
        );
    }
}
