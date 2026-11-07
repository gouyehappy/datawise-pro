package org.apache.datawise.backend.domain;

/** 公开注册请求（需 {@code datawise.tenancy.allow-registration=true}）。 */
public record RegisterRequest(
        String userName,
        String password,
        String email,
        String displayName,
        String tenantName,
        String tenantSlug,
        Boolean createTenant) {
}
