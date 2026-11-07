package org.apache.datawise.backend.domain;

import java.time.Instant;
import java.util.List;

/** 租户成员摘要（平台超管 / 租户管理员成员管理）。 */
public record TenantMemberDto(
        long userId,
        String username,
        String status,
        List<String> roleKeys,
        Instant joinedAt) {
}
