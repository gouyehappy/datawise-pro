package org.apache.datawise.backend.domain;

import java.util.Map;

/** Instance-level OIDC settings. Secrets never returned to clients. */
public record OidcConfigDto(
        boolean enabled,
        String issuer,
        String clientId,
        boolean hasClientSecret,
        String redirectUri,
        String frontendRedirectBase,
        String scopes,
        boolean localLoginEnabled,
        String tenantClaim,
        Map<String, String> tenantClaimMap,
        String defaultOidcRoleKey,
        boolean autoProvisionMembership,
        String roleClaim,
        Map<String, String> roleClaimMap,
        boolean syncRolesFromClaim,
        boolean deprovisionMissingRoleClaim) {
}
