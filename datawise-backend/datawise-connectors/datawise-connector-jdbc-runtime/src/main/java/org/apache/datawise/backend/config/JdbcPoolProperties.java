package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Per-datasource HikariCP pool defaults and JDBC read tuning.
 */
@ConfigurationProperties(prefix = "datawise.jdbc.pool")
public class JdbcPoolProperties {

    private int maximumPoolSize = 10;
    private int minimumIdle = 2;
    private long idleTimeoutMs = 60_000;
    private long maxLifetimeMs = 600_000;
    private long connectionTimeoutMs = 10_000;
    private long validationTimeoutMs = 3_000;
    private long keepaliveTimeMs = 30_000;
    /**
     * Default {@link java.sql.Statement#setFetchSize(int)} for SELECT reads; 0 keeps driver default.
     */
    private int defaultFetchSize = 500;

    public int getMaximumPoolSize() {
        return maximumPoolSize;
    }

    public void setMaximumPoolSize(int maximumPoolSize) {
        this.maximumPoolSize = Math.max(1, maximumPoolSize);
    }

    public int getMinimumIdle() {
        return minimumIdle;
    }

    public void setMinimumIdle(int minimumIdle) {
        this.minimumIdle = Math.max(0, minimumIdle);
    }

    public long getIdleTimeoutMs() {
        return idleTimeoutMs;
    }

    public void setIdleTimeoutMs(long idleTimeoutMs) {
        this.idleTimeoutMs = Math.max(0, idleTimeoutMs);
    }

    public long getMaxLifetimeMs() {
        return maxLifetimeMs;
    }

    public void setMaxLifetimeMs(long maxLifetimeMs) {
        this.maxLifetimeMs = Math.max(30_000, maxLifetimeMs);
    }

    public long getConnectionTimeoutMs() {
        return connectionTimeoutMs;
    }

    public void setConnectionTimeoutMs(long connectionTimeoutMs) {
        this.connectionTimeoutMs = Math.max(250, connectionTimeoutMs);
    }

    public long getValidationTimeoutMs() {
        return validationTimeoutMs;
    }

    public void setValidationTimeoutMs(long validationTimeoutMs) {
        this.validationTimeoutMs = Math.max(250, validationTimeoutMs);
    }

    public long getKeepaliveTimeMs() {
        return keepaliveTimeMs;
    }

    public void setKeepaliveTimeMs(long keepaliveTimeMs) {
        this.keepaliveTimeMs = Math.max(0, keepaliveTimeMs);
    }

    public int getDefaultFetchSize() {
        return defaultFetchSize;
    }

    public void setDefaultFetchSize(int defaultFetchSize) {
        this.defaultFetchSize = Math.max(0, defaultFetchSize);
    }

    public void applyFetchSize(java.sql.Statement statement) throws java.sql.SQLException {
        if (defaultFetchSize > 0) {
            statement.setFetchSize(defaultFetchSize);
        }
    }

    /**
     * Paged SELECT reads request {@code pageSize + 1} rows to detect {@code hasMore}.
     * Fetch size must exceed the probe row count or drivers may stop at {@code defaultFetchSize}
     * and falsely report end-of-result after a full page (migration stops after one batch).
     */
    public void applyPagedReadFetchSize(java.sql.Statement statement, int pageSize) throws java.sql.SQLException {
        int probeRows = Math.max(1, pageSize + 1);
        if (defaultFetchSize > 0) {
            statement.setFetchSize(Math.max(defaultFetchSize, probeRows));
            return;
        }
        statement.setFetchSize(probeRows);
    }
}
