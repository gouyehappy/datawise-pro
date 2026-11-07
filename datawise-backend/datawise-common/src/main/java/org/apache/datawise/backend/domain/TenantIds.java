package org.apache.datawise.backend.domain;

/**
 * 产品租户 ID 约定（与 {@code TenantSlotPolicy} 的迁移配额 tenant 无关）。
 */
public final class TenantIds {

    /** {@code tenancy.mode=single} 唯一租户；升级迁移目标。 */
    public static final String DEFAULT = "default";

    public static final String ROLE_TENANT_ADMIN = "tenant_admin";
    public static final String ROLE_DEVELOPER = "developer";
    public static final String ROLE_ANALYST = "analyst";
    public static final String ROLE_READONLY = "readonly";

    public static final String ROLE_ID_TENANT_ADMIN = "role-tenant-admin";
    public static final String ROLE_ID_DEVELOPER = "role-developer";
    public static final String ROLE_ID_ANALYST = "role-analyst";
    public static final String ROLE_ID_READONLY = "role-readonly";

    private TenantIds() {
    }

    public static String normalizeOrDefault(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) {
            return DEFAULT;
        }
        return tenantId.trim();
    }
}
