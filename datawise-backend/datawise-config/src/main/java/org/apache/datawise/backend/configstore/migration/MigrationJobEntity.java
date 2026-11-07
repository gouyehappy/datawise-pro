package org.apache.datawise.backend.configstore.migration;

import org.apache.datawise.backend.domain.MigrationTableCheckpoint;
import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TableMigrationResult;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 持久化迁移任务：多表 checkpoint 与请求快照。 */
public class MigrationJobEntity {

    private String id;
    private long userId;
    private String status;
    private String requestFingerprint;
    private TableMigrationBatchRequest request;
    private List<String> tablesPlanned;
    private Map<String, MigrationTableCheckpoint> tables = new LinkedHashMap<>();
    private List<TableMigrationResult> results = List.of();
    private Instant createdAt;
    private Instant updatedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public long getUserId() {
        return userId;
    }

    public void setUserId(long userId) {
        this.userId = userId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getRequestFingerprint() {
        return requestFingerprint;
    }

    public void setRequestFingerprint(String requestFingerprint) {
        this.requestFingerprint = requestFingerprint;
    }

    public TableMigrationBatchRequest getRequest() {
        return request;
    }

    public void setRequest(TableMigrationBatchRequest request) {
        this.request = request;
    }

    public List<String> getTablesPlanned() {
        return tablesPlanned;
    }

    public void setTablesPlanned(List<String> tablesPlanned) {
        this.tablesPlanned = tablesPlanned;
    }

    public Map<String, MigrationTableCheckpoint> getTables() {
        return tables;
    }

    public void setTables(Map<String, MigrationTableCheckpoint> tables) {
        this.tables = tables != null ? tables : new LinkedHashMap<>();
    }

    public List<TableMigrationResult> getResults() {
        return results;
    }

    public void setResults(List<TableMigrationResult> results) {
        this.results = results != null ? results : List.of();
    }

    public MigrationTableCheckpoint tableCheckpoint(String tableName) {
        if (tables == null) {
            tables = new LinkedHashMap<>();
        }
        return tables.get(tableName);
    }

    public void putTableCheckpoint(MigrationTableCheckpoint checkpoint) {
        if (tables == null) {
            tables = new LinkedHashMap<>();
        }
        tables.put(checkpoint.getTableName(), checkpoint);
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
