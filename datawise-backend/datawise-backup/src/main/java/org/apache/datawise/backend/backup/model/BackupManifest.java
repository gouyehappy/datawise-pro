package org.apache.datawise.backend.backup.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class BackupManifest {

    public static final int SCHEMA_VERSION = 1;

    private int schemaVersion = SCHEMA_VERSION;
    private String artifactId;
    private String type;
    private String tenantId;
    private Instant createdAt;
    private Long createdByUserId;
    private String trigger;
    private String policyId;
    private String status;
    private String appVersion;
    private List<BackupManifestFile> files = new ArrayList<>();
    private BackupManifestEncryption encryption = new BackupManifestEncryption();
    private BackupManifestWorkbench workbench;
    private BackupManifestDatabase database;
    private List<String> warnings = new ArrayList<>();

    public int getSchemaVersion() {
        return schemaVersion;
    }

    public void setSchemaVersion(int schemaVersion) {
        this.schemaVersion = schemaVersion;
    }

    public String getArtifactId() {
        return artifactId;
    }

    public void setArtifactId(String artifactId) {
        this.artifactId = artifactId;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getTenantId() {
        return tenantId;
    }

    public void setTenantId(String tenantId) {
        this.tenantId = tenantId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }

    public String getTrigger() {
        return trigger;
    }

    public void setTrigger(String trigger) {
        this.trigger = trigger;
    }

    public String getPolicyId() {
        return policyId;
    }

    public void setPolicyId(String policyId) {
        this.policyId = policyId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getAppVersion() {
        return appVersion;
    }

    public void setAppVersion(String appVersion) {
        this.appVersion = appVersion;
    }

    public List<BackupManifestFile> getFiles() {
        return files;
    }

    public void setFiles(List<BackupManifestFile> files) {
        this.files = files != null ? files : new ArrayList<>();
    }

    public BackupManifestEncryption getEncryption() {
        return encryption;
    }

    public void setEncryption(BackupManifestEncryption encryption) {
        this.encryption = encryption != null ? encryption : new BackupManifestEncryption();
    }

    public BackupManifestWorkbench getWorkbench() {
        return workbench;
    }

    public void setWorkbench(BackupManifestWorkbench workbench) {
        this.workbench = workbench;
    }

    public BackupManifestDatabase getDatabase() {
        return database;
    }

    public void setDatabase(BackupManifestDatabase database) {
        this.database = database;
    }

    public List<String> getWarnings() {
        return warnings;
    }

    public void setWarnings(List<String> warnings) {
        this.warnings = warnings != null ? warnings : new ArrayList<>();
    }

    public static class BackupManifestFile {
        private String name;
        private long sizeBytes;
        private String sha256;

        public BackupManifestFile() {
        }

        public BackupManifestFile(String name, long sizeBytes, String sha256) {
            this.name = name;
            this.sizeBytes = sizeBytes;
            this.sha256 = sha256;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public long getSizeBytes() {
            return sizeBytes;
        }

        public void setSizeBytes(long sizeBytes) {
            this.sizeBytes = sizeBytes;
        }

        public String getSha256() {
            return sha256;
        }

        public void setSha256(String sha256) {
            this.sha256 = sha256;
        }
    }

    public static class BackupManifestEncryption {
        private String alg = "none";
        private String keySource = "none";

        public String getAlg() {
            return alg;
        }

        public void setAlg(String alg) {
            this.alg = alg;
        }

        public String getKeySource() {
            return keySource;
        }

        public void setKeySource(String keySource) {
            this.keySource = keySource;
        }
    }

    public static class BackupManifestWorkbench {
        private boolean includePlugins;
        private boolean includeDrivers;
        private boolean includeSqlHistory;
        private String storageBackend;
        private boolean masterKeyIncluded;
        private List<String> paths = new ArrayList<>();

        public boolean isIncludePlugins() {
            return includePlugins;
        }

        public void setIncludePlugins(boolean includePlugins) {
            this.includePlugins = includePlugins;
        }

        public boolean isIncludeDrivers() {
            return includeDrivers;
        }

        public void setIncludeDrivers(boolean includeDrivers) {
            this.includeDrivers = includeDrivers;
        }

        public boolean isIncludeSqlHistory() {
            return includeSqlHistory;
        }

        public void setIncludeSqlHistory(boolean includeSqlHistory) {
            this.includeSqlHistory = includeSqlHistory;
        }

        public String getStorageBackend() {
            return storageBackend;
        }

        public void setStorageBackend(String storageBackend) {
            this.storageBackend = storageBackend;
        }

        public boolean isMasterKeyIncluded() {
            return masterKeyIncluded;
        }

        public void setMasterKeyIncluded(boolean masterKeyIncluded) {
            this.masterKeyIncluded = masterKeyIncluded;
        }

        public List<String> getPaths() {
            return paths;
        }

        public void setPaths(List<String> paths) {
            this.paths = paths != null ? paths : new ArrayList<>();
        }
    }

    public static class BackupManifestDatabase {
        private String connectionId;
        private String connectionName;
        private String dbType;
        private String database;
        private String contentMode;
        private String engine;
        private String consistency;
        private Integer tableCount;
        private Long rowEstimate;
        private Integer maxRowsApplied;
        private Long durationMs;
        /** {@code per_table} (default for new backups) or {@code single_file} (legacy). */
        private String layout;
        private Integer parallelism;
        private Integer successTables;
        private Integer failedTables;
        private Long totalBytes;
        private List<String> tableOrder = new ArrayList<>();

        public String getConnectionId() {
            return connectionId;
        }

        public void setConnectionId(String connectionId) {
            this.connectionId = connectionId;
        }

        public String getConnectionName() {
            return connectionName;
        }

        public void setConnectionName(String connectionName) {
            this.connectionName = connectionName;
        }

        public String getDbType() {
            return dbType;
        }

        public void setDbType(String dbType) {
            this.dbType = dbType;
        }

        public String getDatabase() {
            return database;
        }

        public void setDatabase(String database) {
            this.database = database;
        }

        public String getContentMode() {
            return contentMode;
        }

        public void setContentMode(String contentMode) {
            this.contentMode = contentMode;
        }

        public String getEngine() {
            return engine;
        }

        public void setEngine(String engine) {
            this.engine = engine;
        }

        public String getConsistency() {
            return consistency;
        }

        public void setConsistency(String consistency) {
            this.consistency = consistency;
        }

        public Integer getTableCount() {
            return tableCount;
        }

        public void setTableCount(Integer tableCount) {
            this.tableCount = tableCount;
        }

        public Long getRowEstimate() {
            return rowEstimate;
        }

        public void setRowEstimate(Long rowEstimate) {
            this.rowEstimate = rowEstimate;
        }

        public Integer getMaxRowsApplied() {
            return maxRowsApplied;
        }

        public void setMaxRowsApplied(Integer maxRowsApplied) {
            this.maxRowsApplied = maxRowsApplied;
        }

        public Long getDurationMs() {
            return durationMs;
        }

        public void setDurationMs(Long durationMs) {
            this.durationMs = durationMs;
        }

        public String getLayout() {
            return layout;
        }

        public void setLayout(String layout) {
            this.layout = layout;
        }

        public Integer getParallelism() {
            return parallelism;
        }

        public void setParallelism(Integer parallelism) {
            this.parallelism = parallelism;
        }

        public Integer getSuccessTables() {
            return successTables;
        }

        public void setSuccessTables(Integer successTables) {
            this.successTables = successTables;
        }

        public Integer getFailedTables() {
            return failedTables;
        }

        public void setFailedTables(Integer failedTables) {
            this.failedTables = failedTables;
        }

        public Long getTotalBytes() {
            return totalBytes;
        }

        public void setTotalBytes(Long totalBytes) {
            this.totalBytes = totalBytes;
        }

        public List<String> getTableOrder() {
            return tableOrder;
        }

        public void setTableOrder(List<String> tableOrder) {
            this.tableOrder = tableOrder != null ? tableOrder : new ArrayList<>();
        }
    }
}
