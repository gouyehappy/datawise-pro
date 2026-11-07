package org.apache.datawise.backend.domain;

import java.util.List;
import java.util.Map;

public record LoginResult(
        String sessionId,
        String userName,
        String securityConfigType,
        Long expiresAtEpochMs,
        Long userId,
        boolean admin,
        Map<String, Boolean> featurePermissions,
        String tenantId,
        String tenantName,
        String tenancyMode,
        boolean platformAdmin,
        List<TenantSummaryDto> tenants,
        boolean mustChangePassword) {

    public LoginResult(String sessionId, String userName, String securityConfigType) {
        this(sessionId, userName, securityConfigType, null, null, false, null, TenantIds.DEFAULT, null, "single", false,
                List.of(), false);
    }

    public LoginResult(String sessionId, String userName, String securityConfigType, Long expiresAtEpochMs) {
        this(sessionId, userName, securityConfigType, expiresAtEpochMs, null, false, null, TenantIds.DEFAULT, null,
                "single", false, List.of(), false);
    }

    public LoginResult(
                       String sessionId,
                       String userName,
                       String securityConfigType,
                       Long expiresAtEpochMs,
                       Long userId) {
        this(sessionId, userName, securityConfigType, expiresAtEpochMs, userId, false, null, TenantIds.DEFAULT, null,
                "single", false, List.of(), false);
    }

    public LoginResult(
                       String sessionId,
                       String userName,
                       String securityConfigType,
                       Long expiresAtEpochMs,
                       Long userId,
                       boolean admin,
                       Map<String, Boolean> featurePermissions) {
        this(sessionId, userName, securityConfigType, expiresAtEpochMs, userId, admin, featurePermissions,
                TenantIds.DEFAULT, null, "single", false, List.of(), false);
    }

    public LoginResult(
                       String sessionId,
                       String userName,
                       String securityConfigType,
                       Long expiresAtEpochMs,
                       Long userId,
                       boolean admin,
                       Map<String, Boolean> featurePermissions,
                       String tenantId) {
        this(sessionId, userName, securityConfigType, expiresAtEpochMs, userId, admin, featurePermissions, tenantId,
                null, "single", false, List.of(), false);
    }

    public LoginResult(
                       String sessionId,
                       String userName,
                       String securityConfigType,
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
                securityConfigType,
                expiresAtEpochMs,
                userId,
                admin,
                featurePermissions,
                tenantId,
                tenantName,
                tenancyMode,
                platformAdmin,
                tenants,
                false);
    }
}
