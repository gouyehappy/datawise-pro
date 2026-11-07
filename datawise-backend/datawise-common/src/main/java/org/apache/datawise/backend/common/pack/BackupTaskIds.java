package org.apache.datawise.backend.common.pack;

/**
 * Task-id helpers for backup / restore concurrency tasks (no backup module dependency).
 */
public final class BackupTaskIds {

    private BackupTaskIds() {
    }

    public static boolean isBackupOrRestoreTask(String taskId) {
        return taskId != null && (taskId.startsWith("run-") || taskId.startsWith("rst-"));
    }
}
