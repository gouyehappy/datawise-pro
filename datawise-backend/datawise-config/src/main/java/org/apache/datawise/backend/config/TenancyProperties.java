package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@ConfigurationProperties(prefix = "datawise.tenancy")
public class TenancyProperties {

    /** single = 本地/私有化隐式单租户；multi = SaaS 多租户。 */
    private String mode = "single";

    private String defaultTenantId = "default";

    private boolean allowTenantCreate = false;

    /** 平台超管 userId 白名单（仅 multi 跨租户运营；single 可留空）。 */
    private List<Long> platformAdminUserIds = new ArrayList<>();

    /** 每租户最大连接数；0 = 不限制。 */
    private int maxConnectionsPerTenant = 0;

    /** 是否开放公开注册（本地账号）。 */
    private boolean allowRegistration = false;

    /** 每租户每日 AI 调用上限（chat / analyze / sql.generate）；0 = 不限制。 */
    private int maxAiCallsPerTenantPerDay = 0;

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode != null && !mode.isBlank() ? mode.trim() : "single";
    }

    public String getDefaultTenantId() {
        return defaultTenantId;
    }

    public void setDefaultTenantId(String defaultTenantId) {
        this.defaultTenantId = defaultTenantId != null && !defaultTenantId.isBlank()
                ? defaultTenantId.trim()
                : "default";
    }

    public boolean isAllowTenantCreate() {
        return allowTenantCreate;
    }

    public void setAllowTenantCreate(boolean allowTenantCreate) {
        this.allowTenantCreate = allowTenantCreate;
    }

    public List<Long> getPlatformAdminUserIds() {
        return platformAdminUserIds;
    }

    public void setPlatformAdminUserIds(List<Long> platformAdminUserIds) {
        this.platformAdminUserIds = platformAdminUserIds != null ? platformAdminUserIds : new ArrayList<>();
    }

    public int getMaxConnectionsPerTenant() {
        return maxConnectionsPerTenant;
    }

    public void setMaxConnectionsPerTenant(int maxConnectionsPerTenant) {
        this.maxConnectionsPerTenant = Math.max(0, maxConnectionsPerTenant);
    }

    public boolean isAllowRegistration() {
        return allowRegistration;
    }

    public void setAllowRegistration(boolean allowRegistration) {
        this.allowRegistration = allowRegistration;
    }

    public int getMaxAiCallsPerTenantPerDay() {
        return maxAiCallsPerTenantPerDay;
    }

    public void setMaxAiCallsPerTenantPerDay(int maxAiCallsPerTenantPerDay) {
        this.maxAiCallsPerTenantPerDay = Math.max(0, maxAiCallsPerTenantPerDay);
    }

    public boolean isSingleMode() {
        return !"multi".equalsIgnoreCase(mode);
    }

    public boolean isMultiMode() {
        return "multi".equalsIgnoreCase(mode);
    }
}
