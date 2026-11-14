package org.apache.datawise.backend.service.portability;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Manifest for {@code datawise-profile} (.dwprofile) packages. */
public class ProfileManifest {

    public static final String KIND = "datawise-profile";
    public static final int SCHEMA_VERSION = 1;
    public static final String SECRET_MODE_SEALED = "sealed";
    /** Cloud-sync default: credentials stripped from payload and not packaged. */
    public static final String SECRET_MODE_OMITTED = "omitted";

    private String kind = KIND;
    private int schemaVersion = SCHEMA_VERSION;
    private String appVersion;
    private String exportedAt;
    private String tenantId;
    private Long userId;
    private String secretMode = SECRET_MODE_SEALED;
    private List<String> domains = new ArrayList<>();
    private List<String> warnings = new ArrayList<>();
    private Map<String, Object> counts = new LinkedHashMap<>();

    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    public int getSchemaVersion() {
        return schemaVersion;
    }

    public void setSchemaVersion(int schemaVersion) {
        this.schemaVersion = schemaVersion;
    }

    public String getAppVersion() {
        return appVersion;
    }

    public void setAppVersion(String appVersion) {
        this.appVersion = appVersion;
    }

    public String getExportedAt() {
        return exportedAt;
    }

    public void setExportedAt(String exportedAt) {
        this.exportedAt = exportedAt;
    }

    public String getTenantId() {
        return tenantId;
    }

    public void setTenantId(String tenantId) {
        this.tenantId = tenantId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getSecretMode() {
        return secretMode;
    }

    public void setSecretMode(String secretMode) {
        this.secretMode = secretMode;
    }

    public List<String> getDomains() {
        return domains;
    }

    public void setDomains(List<String> domains) {
        this.domains = domains != null ? domains : new ArrayList<>();
    }

    public List<String> getWarnings() {
        return warnings;
    }

    public void setWarnings(List<String> warnings) {
        this.warnings = warnings != null ? warnings : new ArrayList<>();
    }

    public Map<String, Object> getCounts() {
        return counts;
    }

    public void setCounts(Map<String, Object> counts) {
        this.counts = counts != null ? counts : new LinkedHashMap<>();
    }
}
