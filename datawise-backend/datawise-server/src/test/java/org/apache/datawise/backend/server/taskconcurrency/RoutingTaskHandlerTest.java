package org.apache.datawise.backend.server.taskconcurrency;

import org.apache.datawise.taskconcurrency.api.TaskExecutionContext;
import org.apache.datawise.taskconcurrency.api.TaskHandler;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.BeanFactory;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RoutingTaskHandlerTest {

    @Mock
    private TaskHandler backupTaskHandler;
    @Mock
    private TaskHandler migrationTaskHandler;
    @Mock
    private BeanFactory beanFactory;
    @Mock
    private TaskExecutionContext context;

    @Test
    void routesBackupRuns() throws Exception {
        RoutingTaskHandler handler = new RoutingTaskHandler(beanFactory);
        when(context.getTaskId()).thenReturn("run-1");
        when(beanFactory.containsBean(RoutingTaskHandler.BACKUP_HANDLER_BEAN)).thenReturn(true);
        when(beanFactory.getBean(RoutingTaskHandler.BACKUP_HANDLER_BEAN, TaskHandler.class))
                .thenReturn(backupTaskHandler);

        handler.execute(context);

        verify(backupTaskHandler).execute(context);
        verifyNoInteractions(migrationTaskHandler);
    }

    @Test
    void routesRestoreJobs() throws Exception {
        RoutingTaskHandler handler = new RoutingTaskHandler(beanFactory);
        when(context.getTaskId()).thenReturn("rst-1");
        when(beanFactory.containsBean(RoutingTaskHandler.BACKUP_HANDLER_BEAN)).thenReturn(true);
        when(beanFactory.getBean(RoutingTaskHandler.BACKUP_HANDLER_BEAN, TaskHandler.class))
                .thenReturn(backupTaskHandler);

        handler.execute(context);

        verify(backupTaskHandler).execute(context);
        verifyNoInteractions(migrationTaskHandler);
    }

    @Test
    void routesMigrationByDefault() throws Exception {
        RoutingTaskHandler handler = new RoutingTaskHandler(beanFactory);
        when(context.getTaskId()).thenReturn("a1b2c3d4-uuid");
        when(beanFactory.containsBean(RoutingTaskHandler.MIGRATION_HANDLER_BEAN)).thenReturn(true);
        when(beanFactory.getBean(RoutingTaskHandler.MIGRATION_HANDLER_BEAN, TaskHandler.class))
                .thenReturn(migrationTaskHandler);

        handler.execute(context);

        verify(migrationTaskHandler).execute(context);
        verifyNoInteractions(backupTaskHandler);
    }

    @Test
    void failsWhenMigrationEngineMissing() {
        RoutingTaskHandler handler = new RoutingTaskHandler(beanFactory);
        when(context.getTaskId()).thenReturn("a1b2c3d4-uuid");
        when(beanFactory.containsBean(RoutingTaskHandler.MIGRATION_HANDLER_BEAN)).thenReturn(false);

        assertThrows(IllegalStateException.class, () -> handler.execute(context));
    }

    @Test
    void failsWhenBackupEngineMissing() {
        RoutingTaskHandler handler = new RoutingTaskHandler(beanFactory);
        when(context.getTaskId()).thenReturn("run-1");
        when(beanFactory.containsBean(RoutingTaskHandler.BACKUP_HANDLER_BEAN)).thenReturn(false);

        assertThrows(IllegalStateException.class, () -> handler.execute(context));
    }
}
