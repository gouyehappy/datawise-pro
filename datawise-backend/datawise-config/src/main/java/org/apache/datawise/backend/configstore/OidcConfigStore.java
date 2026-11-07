package org.apache.datawise.backend.configstore;

import java.util.LinkedHashMap;
import java.util.Map;

/** Per-tenant OIDC + local-login policy (file or jdbc backend). */
public interface OidcConfigStore {

    void ensureTenantFiles(String tenantId);

    StoredOidcConfig current();

    StoredOidcConfig save(StoredOidcConfig next);

    final class StoredOidcConfig {

        public boolean enabled;
        public String issuer;
        public String clientId;
        public String clientSecret;
        public String redirectUri;
        public String frontendRedirectBase;
        public String scopes = "openid profile email";
        public boolean localLoginEnabled = true;
        public String tenantClaim = "org_id";
        public Map<String, String> tenantClaimMap = new LinkedHashMap<>();
        public String defaultOidcRoleKey = "developer";
        public boolean autoProvisionMembership = true;
        /** IdP groups / roles claim (e.g. {@code groups}). */
        public String roleClaim = "groups";
        /** Map claim value → tenant role key (e.g. {@code datawise-admins=tenant_admin}). */
        public Map<String, String> roleClaimMap = new LinkedHashMap<>();
        /** When true, refresh membership roles from {@link #roleClaim} on each OIDC login. */
        public boolean syncRolesFromClaim = false;
        /**
         * When sync is on and no mapped group remains, set membership {@code disabled}
         * and revoke sessions (org offboarding).
         */
        public boolean deprovisionMissingRoleClaim = false;

        public static StoredOidcConfig disabledDefaults() {
            StoredOidcConfig config = new StoredOidcConfig();
            config.enabled = false;
            config.localLoginEnabled = true;
            config.scopes = "openid profile email";
            config.tenantClaim = "org_id";
            config.tenantClaimMap = new LinkedHashMap<>();
            config.defaultOidcRoleKey = "developer";
            config.autoProvisionMembership = true;
            config.roleClaim = "groups";
            config.roleClaimMap = new LinkedHashMap<>();
            config.syncRolesFromClaim = false;
            config.deprovisionMissingRoleClaim = false;
            return config;
        }

        public StoredOidcConfig normalized() {
            StoredOidcConfig copy = new StoredOidcConfig();
            copy.enabled = enabled;
            copy.issuer = trim(issuer);
            copy.clientId = trim(clientId);
            copy.clientSecret = clientSecret != null ? clientSecret.trim() : null;
            copy.redirectUri = trim(redirectUri);
            copy.frontendRedirectBase = trim(frontendRedirectBase);
            copy.scopes = scopes != null && !scopes.isBlank() ? scopes.trim() : "openid profile email";
            copy.localLoginEnabled = localLoginEnabled;
            copy.tenantClaim = tenantClaim != null && !tenantClaim.isBlank() ? tenantClaim.trim() : "org_id";
            copy.tenantClaimMap = tenantClaimMap != null ? new LinkedHashMap<>(tenantClaimMap) : new LinkedHashMap<>();
            copy.defaultOidcRoleKey = defaultOidcRoleKey != null && !defaultOidcRoleKey.isBlank()
                    ? defaultOidcRoleKey.trim()
                    : "developer";
            copy.autoProvisionMembership = autoProvisionMembership;
            copy.roleClaim = roleClaim != null && !roleClaim.isBlank() ? roleClaim.trim() : "groups";
            copy.roleClaimMap = roleClaimMap != null ? new LinkedHashMap<>(roleClaimMap) : new LinkedHashMap<>();
            copy.syncRolesFromClaim = syncRolesFromClaim;
            copy.deprovisionMissingRoleClaim = deprovisionMissingRoleClaim;
            return copy;
        }

        public Map<String, Object> toPublicMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("enabled", enabled);
            map.put("issuer", issuer);
            map.put("clientId", clientId);
            map.put("hasClientSecret", clientSecret != null && !clientSecret.isBlank());
            map.put("redirectUri", redirectUri);
            map.put("frontendRedirectBase", frontendRedirectBase);
            map.put("scopes", scopes);
            map.put("localLoginEnabled", localLoginEnabled);
            map.put("tenantClaim", tenantClaim);
            map.put("tenantClaimMap", tenantClaimMap);
            map.put("defaultOidcRoleKey", defaultOidcRoleKey);
            map.put("autoProvisionMembership", autoProvisionMembership);
            map.put("roleClaim", roleClaim);
            map.put("roleClaimMap", roleClaimMap);
            map.put("syncRolesFromClaim", syncRolesFromClaim);
            map.put("deprovisionMissingRoleClaim", deprovisionMissingRoleClaim);
            return map;
        }

        private static String trim(String value) {
            return value != null && !value.isBlank() ? value.trim() : null;
        }
    }
}
