package org.apache.datawise.backend.server.backup;

import org.apache.datawise.taskconcurrency.api.TaskExecutionContext;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BackupTaskHandlerTest {

    @Mock
    private BackupOrchestrator orchestrator;
    @Mock
    private TaskExecutionContext context;

    @Test
    void acksOnSuccessForRun() {
        BackupTaskHandler handler = new BackupTaskHandler(orchestrator);
        when(context.getTaskId()).thenReturn("run-abc");

        handler.execute(context);

        verify(orchestrator).executeAdmittedRun(eq("run-abc"), any());
        verify(context).ack();
    }

    @Test
    void acksOnSuccessForRestore() {
        BackupTaskHandler handler = new BackupTaskHandler(orchestrator);
        when(context.getTaskId()).thenReturn("rst-xyz");

        handler.execute(context);

        verify(orchestrator).executeAdmittedRestore(eq("rst-xyz"), any());
        verify(context).ack();
    }

    @Test
    void acksEvenOnFailure() {
        BackupTaskHandler handler = new BackupTaskHandler(orchestrator);
        when(context.getTaskId()).thenReturn("run-fail");
        doThrow(new RuntimeException("boom"))
                .when(orchestrator).executeAdmittedRun(eq("run-fail"), any());

        handler.execute(context);

        verify(context).ack();
    }
}
