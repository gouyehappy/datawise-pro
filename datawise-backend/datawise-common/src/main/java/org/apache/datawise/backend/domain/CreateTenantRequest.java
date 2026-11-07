package org.apache.datawise.backend.domain;

/** 平台超管创建租户。 */
public record CreateTenantRequest(
        String name,
        String slug,
        Long adminUserId) {
}
