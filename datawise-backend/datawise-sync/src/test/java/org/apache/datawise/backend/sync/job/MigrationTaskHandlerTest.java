package org.apache.datawise.backend.sync.job;

import org.apache.datawise.backend.sync.TableMigrationService;
import org.apache.datawise.backend.sync.api.MigrationPausedException;
import org.apache.datawise.taskconcurrency.api.TaskExecutionContext;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MigrationTaskHandlerTest {

    @Mock
    private TableMigrationService migrationService;
    @Mock
    private TaskExecutionContext context;

    @Test
    void acksOnSuccess() throws Exception {
        MigrationTaskHandler handler = new MigrationTaskHandler(migrationService);
        when(context.getTaskId()).thenReturn("job-1");

        handler.execute(context);

        verify(migrationService).executeRunningJob(eq("job-1"), any());
        verify(context).ack();
    }

    @Test
    void acksOnPause() {
        MigrationTaskHandler handler = new MigrationTaskHandler(migrationService);
        when(context.getTaskId()).thenReturn("job-1");
        doThrow(new MigrationPausedException("paused"))
                .when(migrationService).executeRunningJob(eq("job-1"), any());

        org.junit.jupiter.api.Assertions.assertThrows(MigrationPausedException.class, () -> handler.execute(context));

        verify(context).ack();
    }

    @Test
    void doesNotAckOnFailure() {
        MigrationTaskHandler handler = new MigrationTaskHandler(migrationService);
        when(context.getTaskId()).thenReturn("job-1");
        doThrow(new RuntimeException("boom")).when(migrationService).executeRunningJob(eq("job-1"), any());

        org.junit.jupiter.api.Assertions.assertThrows(RuntimeException.class, () -> handler.execute(context));

        verify(context, never()).ack();
    }
}
