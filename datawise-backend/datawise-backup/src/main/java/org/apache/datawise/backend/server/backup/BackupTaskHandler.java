package org.apache.datawise.backend.server.backup;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.taskconcurrency.api.TaskExecutionContext;
import org.apache.datawise.taskconcurrency.api.TaskHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

/**
 * Task-concurrency consumer for backup runs ({@code run-*}) and restore jobs ({@code rst-*}).
 * <p>
 * Always ACKs on completion (success or failure) so failed backups are not lease-reclaimed and retried.
 */
@Component
public class BackupTaskHandler implements TaskHandler {

    private static final Logger log = LoggerFactory.getLogger(BackupTaskHandler.class);

    private final BackupOrchestrator orchestrator;

    public BackupTaskHandler(@Lazy BackupOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
    }

    @Override
    public void execute(TaskExecutionContext context) {
        String taskId = context.getTaskId();
        log.info("backup.task.handler.start taskId={}", taskId);
        context.heartbeat();
        try {
            if (taskId != null && taskId.startsWith("rst-")) {
                orchestrator.executeAdmittedRestore(taskId, context::heartbeat);
            } else {
                orchestrator.executeAdmittedRun(taskId, context::heartbeat);
            }
            log.info("backup.task.handler.done taskId={}", taskId);
        } catch (Exception ex) {
            ExceptionLogging.error(log, "backup.task.failed taskId=" + taskId, ex);
        } finally {
            // Terminal jobs must release the slot; do not leave DISPATCHED for reclaim/retry.
            context.ack();
            log.info("backup.task.handler.ack taskId={}", taskId);
        }
    }
}
