package org.apache.datawise.backend.domain;

import java.util.Map;

/** 创建或更新自定义 / 可编辑租户角色。 */
public record SaveTenantRoleRequest(
        String key,
        String name,
        Map<String, Boolean> permissions) {
}
