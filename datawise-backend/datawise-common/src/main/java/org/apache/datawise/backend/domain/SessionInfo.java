package org.apache.datawise.backend.domain;

import java.util.List;
import java.util.Map;

public record SessionInfo(
        String sessionId,
        String userName,
        boolean guest,
        Long expiresAtEpochMs,
        Long userId,
        boolean admin,
        Map<String, Boolean> featurePermissions,
        String tenantId,
        String tenantName,
        String tenancyMode,
        boolean platformAdmin,
        List<TenantSummaryDto> tenants,
        boolean hasLocalPassword,
        boolean mustChangePassword) {

    public SessionInfo(String sessionId, String userName, boolean guest) {
        this(sessionId, userName, guest, null, null, false, null, TenantIds.DEFAULT, null, "single", false, List.of(), false, false);
    }

    public SessionInfo(String sessionId, String userName, boolean guest, Long expiresAtEpochMs) {
        this(sessionId, userName, guest, expiresAtEpochMs, null, false, null, TenantIds.DEFAULT, null, "single", false,
                List.of(), false, false);
    }

    public SessionInfo(String sessionId, String userName, boolean guest, Long expiresAtEpochMs, Long userId) {
        this(sessionId, userName, guest, expiresAtEpochMs, userId, false, null, TenantIds.DEFAULT, null, "single", false,
                List.of(), false, false);
    }

    public SessionInfo(
                       String sessionId,
                       String userName,
                       boolean guest,
                       Long expiresAtEpochMs,
                       Long userId,
                       boolean admin,
                       Map<String, Boolean> featurePermissions) {
        this(sessionId, userName, guest, expiresAtEpochMs, userId, admin, featurePermissions, TenantIds.DEFAULT, null,
                "single", false, List.of(), false, false);
    }

    public SessionInfo(
                       String sessionId,
                       String userName,
                       boolean guest,
                       Long expiresAtEpochMs,
                       Long userId,
                       boolean admin,
                       Map<String, Boolean> featurePermissions,
                       String tenantId) {
        this(sessionId, userName, guest, expiresAtEpochMs, userId, admin, featurePermissions, tenantId, null, "single",
                false, List.of(), false, false);
    }

    public SessionInfo(
                       String sessionId,
                       String userName,
                       boolean guest,
                       Long expiresAtEpochMs,
                       Long userId,
                       boolean admin,
                       Map<String, Boolean> featurePermissions,
                       String tenantId,
                       String tenantName,
                       String tenancyMode,
                       boolean platformAdmin,
                       List<TenantSummaryDto> tenants) {
        this(
                sessionId,
                userName,
                guest,
                expiresAtEpochMs,
                userId,
                admin,
                featurePermissions,
                tenantId,
                tenantName,
                tenancyMode,
                platformAdmin,
                tenants,
                false,
                false);
    }

    public SessionInfo(
                       String sessionId,
                       String userName,
                       boolean guest,
                       Long expiresAtEpochMs,
                       Long userId,
                       boolean admin,
                       Map<String, Boolean> featurePermissions,
                       String tenantId,
                       String tenantName,
                       String tenancyMode,
                       boolean platformAdmin,
                       List<TenantSummaryDto> tenants,
                       boolean hasLocalPassword) {
        this(
                sessionId,
                userName,
                guest,
                expiresAtEpochMs,
                userId,
                admin,
                featurePermissions,
                tenantId,
                tenantName,
                tenancyMode,
                platformAdmin,
                tenants,
                hasLocalPassword,
                false);
    }
}
