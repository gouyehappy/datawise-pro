package org.apache.datawise.backend.sync.job;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.sync.TableMigrationService;
import org.apache.datawise.backend.sync.api.MigrationCancelledException;
import org.apache.datawise.backend.sync.api.MigrationPausedException;
import org.apache.datawise.taskconcurrency.api.TaskExecutionContext;
import org.apache.datawise.taskconcurrency.api.TaskHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

/**
 * Task-concurrency consumer: runs dispatched migration jobs and releases slots on completion.
 */
@Component
public class MigrationTaskHandler implements TaskHandler {

    private static final Logger log = LoggerFactory.getLogger(MigrationTaskHandler.class);

    private final TableMigrationService migrationService;

    public MigrationTaskHandler(@Lazy TableMigrationService migrationService) {
        this.migrationService = migrationService;
    }

    @Override
    public void execute(TaskExecutionContext context) throws Exception {
        String jobId = context.getTaskId();
        log.info("migration.task.handler.start jobId={}", jobId);
        context.heartbeat();
        try {
            migrationService.executeRunningJob(jobId, context::heartbeat);
            context.ack();
            log.info("migration.task.handler.ack jobId={}", jobId);
        } catch (MigrationPausedException ex) {
            context.ack();
            log.info("migration.task.handler.paused jobId={}", jobId);
            throw ex;
        } catch (Exception ex) {
            // executeRunningJob already ExceptionLogging.error'd; keep a handler-level stack too.
            ExceptionLogging.error(log, "migration.task.failed jobId=" + jobId, ex);
            throw ex;
        }
    }
}
