package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.sync.api.MigrationCheckpointSink;
import org.apache.datawise.backend.sync.api.MigrationExecutionControl;
import org.apache.datawise.backend.sync.api.TableMigrationProgressListener;

/** Job 级钩子：进度、断点、暂停控制。 */
public record TableMigrationJobHooks(
        TableMigrationProgressListener progressListener,
        MigrationCheckpointSink checkpointSink,
        MigrationExecutionControl executionControl,
        boolean continueOnTableFailure
) {
    public static TableMigrationJobHooks noop() {
        return new TableMigrationJobHooks(null, null, MigrationExecutionControl.noop(), false);
    }

    public MigrationExecutionControl executionControlOrNoop() {
        return executionControl != null ? executionControl : MigrationExecutionControl.noop();
    }
}
