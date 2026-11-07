package org.apache.datawise.backend.server.taskconcurrency;

import org.apache.datawise.backend.common.pack.BackupTaskIds;
import org.apache.datawise.taskconcurrency.api.TaskExecutionContext;
import org.apache.datawise.taskconcurrency.api.TaskHandler;
import org.springframework.beans.factory.BeanFactory;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/**
 * Single {@link TaskHandler} bean for {@code TaskConcurrencyRuntime}: routes by task id prefix.
 * <ul>
 *   <li>{@code run-*} / {@code rst-*} → backup bean when datawise-backup is present</li>
 *   <li>otherwise → migration bean {@code migrationTaskHandler} when datawise-sync is present</li>
 * </ul>
 */
@Component
@Primary
public class RoutingTaskHandler implements TaskHandler {

    static final String MIGRATION_HANDLER_BEAN = "migrationTaskHandler";
    static final String BACKUP_HANDLER_BEAN = "backupTaskHandler";

    private final BeanFactory beanFactory;

    public RoutingTaskHandler(BeanFactory beanFactory) {
        this.beanFactory = beanFactory;
    }

    @Override
    public void execute(TaskExecutionContext context) throws Exception {
        if (BackupTaskIds.isBackupOrRestoreTask(context.getTaskId())) {
            if (!beanFactory.containsBean(BACKUP_HANDLER_BEAN)) {
                throw new IllegalStateException("Backup engine is not installed (datawise-backup / pack.backup)");
            }
            TaskHandler backup = beanFactory.getBean(BACKUP_HANDLER_BEAN, TaskHandler.class);
            backup.execute(context);
            return;
        }
        if (!beanFactory.containsBean(MIGRATION_HANDLER_BEAN)) {
            throw new IllegalStateException("Migration engine is not installed (datawise-sync / pack.migration)");
        }
        TaskHandler migration = beanFactory.getBean(MIGRATION_HANDLER_BEAN, TaskHandler.class);
        migration.execute(context);
    }
}
