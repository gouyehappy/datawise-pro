package org.apache.datawise.backend.common.support;

import java.util.Locale;
import java.util.Set;

public final class TeamRoleSupport {

    public static final String OWNER = "owner";
    public static final String ADMIN = "admin";
    public static final String MEMBER = "member";
    public static final String VIEWER = "viewer";

    private static final Set<String> MANAGE_ROLES = Set.of(OWNER, ADMIN);
    private static final Set<String> ASSIGNABLE_ROLES = Set.of(ADMIN, MEMBER, VIEWER);

    private TeamRoleSupport() {
    }

    public static String normalizeRole(String role) {
        if (role == null || role.isBlank()) {
            return MEMBER;
        }
        String normalized = role.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case OWNER, ADMIN, MEMBER, VIEWER -> normalized;
            default -> MEMBER;
        };
    }

    public static boolean canManageTeam(String role) {
        return MANAGE_ROLES.contains(normalizeRole(role));
    }

    public static boolean canAssignRole(String role) {
        return OWNER.equals(normalizeRole(role));
    }

    public static boolean isAssignableRole(String role) {
        return ASSIGNABLE_ROLES.contains(normalizeRole(role));
    }

    public static boolean isViewer(String role) {
        return VIEWER.equals(normalizeRole(role));
    }
}
