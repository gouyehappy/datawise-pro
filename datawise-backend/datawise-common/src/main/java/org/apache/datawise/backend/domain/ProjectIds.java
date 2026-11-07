package org.apache.datawise.backend.domain;

/**
 * 应用内 Project 作用域 ID 约定（与 {@link TenantIds} 正交）。
 */
public final class ProjectIds {

    /** 升级迁移默认项目；每租户保证存在。 */
    public static final String DEFAULT = "proj_default";

    /** 默认项目展示名（中文产品主词）。 */
    public static final String DEFAULT_DISPLAY_NAME = "默认项目";

    public static final String HEADER = "X-DataWise-Project-Id";

    /** 值为 {@code all} 时跳过按活动项目过滤（与 query {@code scope=all} 等价）。 */
    public static final String SCOPE_HEADER = "X-DataWise-Project-Scope";

    private ProjectIds() {
    }

    public static String normalizeOrDefault(String projectId) {
        if (projectId == null || projectId.isBlank()) {
            return DEFAULT;
        }
        return projectId.trim();
    }
}
