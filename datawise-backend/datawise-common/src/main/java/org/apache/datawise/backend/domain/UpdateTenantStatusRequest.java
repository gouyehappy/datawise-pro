package org.apache.datawise.backend.domain;

/** 更新租户状态：active / suspended / deleted。 */
public record UpdateTenantStatusRequest(String status) {
}
