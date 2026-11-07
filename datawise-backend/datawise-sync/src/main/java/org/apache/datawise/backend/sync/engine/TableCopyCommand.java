package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.sync.api.MigrationExecutionControl;

import java.sql.Connection;
import java.util.List;

/** 分页复制一次调用的完整入参。 */
public record TableCopyCommand(
        MigrationEndpoints endpoints,
        Connection sourceConnection,
        Connection targetConnection,
        String tableName,
        String selectSql,
        String watermarkColumn,
        int batchSize,
        int throttleMs,
        List<String> orderByColumns,
        TableMigrationBatchCopier.CopyResumeState resumeState,
        TableMigrationBatchCopier.BatchCommittedCallback callback,
        MigrationExecutionControl executionControl,
        List<String> primaryKeyColumns,
        String conflictStrategy,
        int maxRows
) {
    public static TableCopyCommand simple(
            MigrationEndpoints endpoints,
            Connection sourceConnection,
            Connection targetConnection,
            String tableName,
            String selectSql,
            int batchSize,
            int throttleMs
    ) {
        return new TableCopyCommand(
                endpoints,
                sourceConnection,
                targetConnection,
                tableName,
                selectSql,
                null,
                batchSize,
                throttleMs,
                List.of(),
                TableMigrationBatchCopier.CopyResumeState.fresh(),
                null,
                MigrationExecutionControl.noop(),
                List.of(),
                null,
                0
        );
    }
}
