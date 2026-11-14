package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * MetaForge A3：对象存储配置。{@code provider=local|s3}；与元数据 {@code datawise.storage}
 * （file|jdbc）正交。
 */
@ConfigurationProperties(prefix = "datawise.object-storage")
public class ObjectStorageProperties {

    /** local | s3 */
    private String provider = "local";

    /** Relative to config dir when not absolute. */
    private String localRoot = "object-store";

    /**
     * When true, finished backup artifact trees are mirrored via {@code ObjectStorageProvider}
     * (local second copy or S3). Default off — additive opt-in.
     */
    private boolean publishBackups = false;

    /** Object key prefix for mirrored backups (no leading/trailing slash required). */
    private String backupKeyPrefix = "backups";

    /**
     * When true, SQL export responses are also written via {@code ObjectStorageProvider}.
     * Default off — additive opt-in.
     */
    private boolean publishExports = false;

    /** Object key prefix for published SQL exports. */
    private String exportKeyPrefix = "exports";

    private final S3 s3 = new S3();

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider != null && !provider.isBlank() ? provider.trim() : "local";
    }

    public boolean isLocal() {
        return "local".equalsIgnoreCase(getProvider());
    }

    public boolean isS3() {
        return "s3".equalsIgnoreCase(getProvider());
    }

    public String getLocalRoot() {
        return localRoot;
    }

    public void setLocalRoot(String localRoot) {
        this.localRoot = localRoot != null && !localRoot.isBlank() ? localRoot.trim() : "object-store";
    }

    public boolean isPublishBackups() {
        return publishBackups;
    }

    public void setPublishBackups(boolean publishBackups) {
        this.publishBackups = publishBackups;
    }

    public String getBackupKeyPrefix() {
        return backupKeyPrefix;
    }

    public void setBackupKeyPrefix(String backupKeyPrefix) {
        this.backupKeyPrefix = backupKeyPrefix != null && !backupKeyPrefix.isBlank()
                ? backupKeyPrefix.trim().replaceAll("^/+|/+$", "")
                : "backups";
    }

    public boolean isPublishExports() {
        return publishExports;
    }

    public void setPublishExports(boolean publishExports) {
        this.publishExports = publishExports;
    }

    public String getExportKeyPrefix() {
        return exportKeyPrefix;
    }

    public void setExportKeyPrefix(String exportKeyPrefix) {
        this.exportKeyPrefix = exportKeyPrefix != null && !exportKeyPrefix.isBlank()
                ? exportKeyPrefix.trim().replaceAll("^/+|/+$", "")
                : "exports";
    }

    public S3 getS3() {
        return s3;
    }

    public static class S3 {

        private String endpoint = "";
        private String region = "us-east-1";
        private String accessKey = "";
        private String secretKey = "";
        private String bucket = "";
        /** MinIO / path-style gateways typically need this. */
        private boolean pathStyleAccess = true;

        public String getEndpoint() {
            return endpoint;
        }

        public void setEndpoint(String endpoint) {
            this.endpoint = endpoint != null ? endpoint.trim() : "";
        }

        public String getRegion() {
            return region;
        }

        public void setRegion(String region) {
            this.region = region != null && !region.isBlank() ? region.trim() : "us-east-1";
        }

        public String getAccessKey() {
            return accessKey;
        }

        public void setAccessKey(String accessKey) {
            this.accessKey = accessKey != null ? accessKey.trim() : "";
        }

        public String getSecretKey() {
            return secretKey;
        }

        public void setSecretKey(String secretKey) {
            this.secretKey = secretKey != null ? secretKey : "";
        }

        public String getBucket() {
            return bucket;
        }

        public void setBucket(String bucket) {
            this.bucket = bucket != null ? bucket.trim() : "";
        }

        public boolean isPathStyleAccess() {
            return pathStyleAccess;
        }

        public void setPathStyleAccess(boolean pathStyleAccess) {
            this.pathStyleAccess = pathStyleAccess;
        }
    }
}
