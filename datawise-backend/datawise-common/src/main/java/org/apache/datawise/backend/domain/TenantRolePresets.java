package org.apache.datawise.backend.domain;

import java.util.Map;

/**
 * 内置租户角色权限预设；键对齐 {@link UserFeaturePermission}。
 */
public final class TenantRolePresets {

    private TenantRolePresets() {
    }

    public static Map<String, Boolean> tenantAdmin() {
        return UserFeaturePermission.fullPreset();
    }

    /** 接近全量，但不能管账号权限 / 租户成员 / 集成。 */
    public static Map<String, Boolean> developer() {
        Map<String, Boolean> map = UserFeaturePermission.fullPreset();
        map.put(UserFeaturePermission.SETTINGS_USER_PERMISSIONS, false);
        map.put(UserFeaturePermission.SETTINGS_TENANTS, false);
        map.put(UserFeaturePermission.SETTINGS_INTEGRATIONS, false);
        return map;
    }

    public static Map<String, Boolean> analyst() {
        Map<String, Boolean> map = UserFeaturePermission.workbenchPreset();
        map.put(UserFeaturePermission.NAV_DASHBOARD, true);
        map.put(UserFeaturePermission.NAV_AI, true);
        map.put(UserFeaturePermission.NAV_SETTINGS, true);
        map.put(UserFeaturePermission.SHORTCUT_EXPORT, true);
        map.put(UserFeaturePermission.WORKBENCH_CONSOLE_AI, true);
        map.put(UserFeaturePermission.WORKBENCH_RESULT_AI_SUMMARY, true);
        map.put(UserFeaturePermission.WORKBENCH_EXPLORER_CATALOG_AI, true);
        map.put(UserFeaturePermission.SETTINGS_BASIC, true);
        map.put(UserFeaturePermission.SETTINGS_PROFILE, true);
        map.put(UserFeaturePermission.SETTINGS_AI, true);
        map.put(UserFeaturePermission.SETTINGS_ABOUT, true);
        map.put(UserFeaturePermission.WORKBENCH_CONSOLE_DANGEROUS_SQL, false);
        map.put(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_DANGEROUS, false);
        return map;
    }

    public static Map<String, Boolean> readonly() {
        Map<String, Boolean> map = UserFeaturePermission.workbenchPreset();
        map.put(UserFeaturePermission.WORKBENCH_CONSOLE_DANGEROUS_SQL, false);
        map.put(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_DANGEROUS, false);
        map.put(UserFeaturePermission.WORKBENCH_EXPLORER_ADD, false);
        map.put(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EDIT, false);
        return map;
    }
}
