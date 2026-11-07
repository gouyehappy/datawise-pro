package org.apache.datawise.backend.domain;

import java.util.Map;

public record SaveOidcConfigRequest(
        Boolean enabled,
        String issuer,
        String clientId,
        String clientSecret,
        String redirectUri,
        String frontendRedirectBase,
        String scopes,
        Boolean localLoginEnabled,
        String tenantClaim,
        Map<String, String> tenantClaimMap,
        String defaultOidcRoleKey,
        Boolean autoProvisionMembership,
        String roleClaim,
        Map<String, String> roleClaimMap,
        Boolean syncRolesFromClaim,
        Boolean deprovisionMissingRoleClaim) {
}
