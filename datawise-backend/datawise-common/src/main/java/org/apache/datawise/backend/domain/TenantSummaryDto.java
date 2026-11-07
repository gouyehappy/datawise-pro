package org.apache.datawise.backend.domain;

import java.util.List;

/** 用户可切换的租户摘要（登录 / session 契约）。 */
public record TenantSummaryDto(
        String id,
        String slug,
        String name,
        String status,
        List<String> roleKeys) {
}
