package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "datawise.explorer.schema-session")
public class ExplorerSchemaProperties {

    /** Idle time before an explorer JDBC schema session is closed. */
    private long idleTimeoutMs = 120_000;

    /** Maximum pooled schema sessions across connection ids. */
    private int maxEntries = 16;

    /** In-memory schema cache TTL for connection roots (milliseconds). */
    private long schemaCacheTtlMs = 3_600_000;

    /** Default page size when listing tables under a schema folder. */
    private int tableListPageSize = 500;

    public long getIdleTimeoutMs() {
        return idleTimeoutMs;
    }

    public void setIdleTimeoutMs(long idleTimeoutMs) {
        this.idleTimeoutMs = Math.max(1_000, idleTimeoutMs);
    }

    public int getMaxEntries() {
        return maxEntries;
    }

    public void setMaxEntries(int maxEntries) {
        this.maxEntries = Math.max(1, maxEntries);
    }

    public long getSchemaCacheTtlMs() {
        return schemaCacheTtlMs;
    }

    public void setSchemaCacheTtlMs(long schemaCacheTtlMs) {
        this.schemaCacheTtlMs = Math.max(0, schemaCacheTtlMs);
    }

    public int getTableListPageSize() {
        return tableListPageSize;
    }

    public void setTableListPageSize(int tableListPageSize) {
        this.tableListPageSize = Math.max(50, tableListPageSize);
    }
}
