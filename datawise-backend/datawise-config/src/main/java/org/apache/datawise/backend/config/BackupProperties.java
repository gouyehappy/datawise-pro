package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "datawise.backup")
public class BackupProperties {

    /** Relative to config dir when destination root is empty. */
    private String defaultRoot = "backups";

    private boolean allowCustomRoot = true;

    /** Empty = any absolute path (still sanitized). */
    private java.util.List<String> customRootAllowlist = java.util.List.of();

    /**
     * Tenant max concurrent backup/restore jobs admitted via task-concurrency
     * ({@code TenantSlotPolicy.maxConcurrent}). Also sizes the legacy job executor fallback.
     */
    private int maxConcurrentRuns = 1;

    private Duration runTimeout = Duration.ofHours(6);

    private long diskMinFreeBytes = 1_073_741_824L;

    private String workbenchEncryptionDefault = "none";

    /**
     * Intra-job parallel workers for per-table database export (not global admission).
     * Global / tenant concurrency is controlled by task-concurrency slots.
     */
    private int tableParallelism = Math.min(8, Math.max(2, Runtime.getRuntime().availableProcessors()));

    /** Fail the whole run if any table backup fails (default true). */
    private boolean failFastOnTableError = true;

    public String getDefaultRoot() {
        return defaultRoot;
    }

    public void setDefaultRoot(String defaultRoot) {
        this.defaultRoot = defaultRoot != null && !defaultRoot.isBlank() ? defaultRoot.trim() : "backups";
    }

    public boolean isAllowCustomRoot() {
        return allowCustomRoot;
    }

    public void setAllowCustomRoot(boolean allowCustomRoot) {
        this.allowCustomRoot = allowCustomRoot;
    }

    public java.util.List<String> getCustomRootAllowlist() {
        return customRootAllowlist;
    }

    public void setCustomRootAllowlist(java.util.List<String> customRootAllowlist) {
        this.customRootAllowlist = customRootAllowlist != null ? customRootAllowlist : java.util.List.of();
    }

    public int getMaxConcurrentRuns() {
        return maxConcurrentRuns;
    }

    public void setMaxConcurrentRuns(int maxConcurrentRuns) {
        this.maxConcurrentRuns = Math.max(1, maxConcurrentRuns);
    }

    public Duration getRunTimeout() {
        return runTimeout;
    }

    public void setRunTimeout(Duration runTimeout) {
        this.runTimeout = runTimeout != null ? runTimeout : Duration.ofHours(6);
    }

    public long getDiskMinFreeBytes() {
        return diskMinFreeBytes;
    }

    public void setDiskMinFreeBytes(long diskMinFreeBytes) {
        this.diskMinFreeBytes = Math.max(0, diskMinFreeBytes);
    }

    public String getWorkbenchEncryptionDefault() {
        return workbenchEncryptionDefault;
    }

    public void setWorkbenchEncryptionDefault(String workbenchEncryptionDefault) {
        this.workbenchEncryptionDefault = workbenchEncryptionDefault != null
                ? workbenchEncryptionDefault.trim()
                : "none";
    }

    public int getTableParallelism() {
        return tableParallelism;
    }

    public void setTableParallelism(int tableParallelism) {
        this.tableParallelism = Math.max(1, tableParallelism);
    }

    public boolean isFailFastOnTableError() {
        return failFastOnTableError;
    }

    public void setFailFastOnTableError(boolean failFastOnTableError) {
        this.failFastOnTableError = failFastOnTableError;
    }
}
