package org.apache.datawise.backend.domain;

import java.util.Map;

public record TenantRoleDto(
        String id,
        String key,
        String name,
        boolean system,
        Map<String, Boolean> permissions) {
}
