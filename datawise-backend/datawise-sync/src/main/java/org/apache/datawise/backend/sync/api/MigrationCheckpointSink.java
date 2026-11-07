package org.apache.datawise.backend.sync.api;

import java.util.Optional;

/** 迁移执行期 checkpoint 写入与续传读取。 */
public interface MigrationCheckpointSink {

    record ResumePoint(
            long startOffset,
            long priorRowsMigrated,
            int priorBatches,
            String lastWatermark,
            String lastSeekKey
    ) {
    }

    boolean isTableCompleted(String tableName);

    boolean hasTableProgress(String tableName);

    Optional<ResumePoint> resumePointFor(String tableName, String selectSql, int batchSize);

    void onTableRunning(String tableName, String tableFingerprint);

    void onBatchCommitted(
            String tableName,
            String tableFingerprint,
            long offset,
            long rowsMigrated,
            int batches,
            String lastWatermark,
            String lastSeekKey
    );

    void onTableCompleted(String tableName, String tableFingerprint, long rowsMigrated, int batches, String lastWatermark);

    void onTableFailed(String tableName, String tableFingerprint, long rowsMigrated, int batches);

    long partialRowsFor(String tableName);

    /** 将内存中未落盘的 checkpoint 写入持久化（暂停/失败前调用）。 */
    default void flush() {
    }
}
