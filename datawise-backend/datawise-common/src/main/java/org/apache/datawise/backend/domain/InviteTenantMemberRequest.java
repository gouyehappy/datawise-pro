package org.apache.datawise.backend.domain;

import java.util.List;

/** 将已有用户加入租户并赋予角色（userId 或 username 二选一）。 */
public record InviteTenantMemberRequest(
        Long userId,
        String username,
        List<String> roleKeys) {
}
