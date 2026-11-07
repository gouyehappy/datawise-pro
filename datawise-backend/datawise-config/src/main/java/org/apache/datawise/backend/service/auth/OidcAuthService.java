package org.apache.datawise.backend.service.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.OidcConfigStore;
import org.apache.datawise.backend.configstore.OidcConfigStore.StoredOidcConfig;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.domain.AuthLoginOptionsDto;
import org.apache.datawise.backend.domain.LoginResult;
import org.apache.datawise.backend.domain.OidcConfigDto;
import org.apache.datawise.backend.domain.SaveOidcConfigRequest;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.TenantEntity;
import org.apache.datawise.backend.model.TenantRoleEntity;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.model.UserTenantMembership;
import org.apache.datawise.backend.service.AuthService;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.apache.datawise.backend.service.UserPermissionPolicy;
import org.apache.datawise.backend.service.tenant.TenantService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * OIDC Authorization Code + PKCE (no Spring Security OAuth dependency).
 */
@Service
public class OidcAuthService {

    private static final Logger log = LoggerFactory.getLogger(OidcAuthService.class);
    private static final Duration STATE_TTL = Duration.ofMinutes(10);

    private final OidcConfigStore oidcConfigStore;
    private final UserStore userStore;
    private final AuthService authService;
    private final UserAdminPolicy userAdminPolicy;
    private final UserPermissionPolicy userPermissionPolicy;
    private final TenancyProperties tenancyProperties;
    private final TenantStore tenantStore;
    private final TenantService tenantService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final SecureRandom secureRandom = new SecureRandom();
    private final ConcurrentHashMap<String, PendingAuth> pending = new ConcurrentHashMap<>();
    private final OidcIdTokenVerifier idTokenVerifier;

    public OidcAuthService(
                           OidcConfigStore oidcConfigStore,
                           UserStore userStore,
                           AuthService authService,
                           UserAdminPolicy userAdminPolicy,
                           UserPermissionPolicy userPermissionPolicy,
                           TenancyProperties tenancyProperties,
                           TenantStore tenantStore,
                           TenantService tenantService,
                           ObjectMapper objectMapper) {
        this.oidcConfigStore = oidcConfigStore;
        this.userStore = userStore;
        this.authService = authService;
        this.userAdminPolicy = userAdminPolicy;
        this.userPermissionPolicy = userPermissionPolicy;
        this.tenancyProperties = tenancyProperties;
        this.tenantStore = tenantStore;
        this.tenantService = tenantService;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        this.idTokenVerifier = new OidcIdTokenVerifier(objectMapper, this.httpClient);
    }

    public AuthLoginOptionsDto loginOptions() {
        StoredOidcConfig config = oidcConfigStore.current();
        return new AuthLoginOptionsDto(
                config.localLoginEnabled,
                config.enabled,
                config.enabled ? "OIDC" : null,
                tenancyProperties.isAllowRegistration() && config.localLoginEnabled,
                tenancyProperties.isMultiMode() && tenancyProperties.isAllowTenantCreate(),
                tenancyProperties.isMultiMode() ? "multi" : "single");
    }

    public OidcConfigDto getConfigForAdmin() {
        userAdminPolicy.requireAdminUser();
        StoredOidcConfig config = oidcConfigStore.current();
        return toDto(config);
    }

    public OidcConfigDto saveConfig(SaveOidcConfigRequest request) {
        userAdminPolicy.requireAdminUser();
        StoredOidcConfig current = oidcConfigStore.current();
        StoredOidcConfig next = current.normalized();
        if (request.enabled() != null) {
            next.enabled = request.enabled();
        }
        if (request.issuer() != null) {
            next.issuer = request.issuer().trim();
        }
        if (request.clientId() != null) {
            next.clientId = request.clientId().trim();
        }
        if (request.clientSecret() != null) {
            String secret = request.clientSecret().trim();
            if (!secret.isEmpty()) {
                next.clientSecret = secret;
            }
        }
        if (request.redirectUri() != null) {
            next.redirectUri = request.redirectUri().trim();
        }
        if (request.frontendRedirectBase() != null) {
            next.frontendRedirectBase = request.frontendRedirectBase().trim();
        }
        if (request.scopes() != null && !request.scopes().isBlank()) {
            next.scopes = request.scopes().trim();
        }
        if (request.localLoginEnabled() != null) {
            next.localLoginEnabled = request.localLoginEnabled();
        }
        if (request.tenantClaim() != null) {
            next.tenantClaim = request.tenantClaim().trim();
        }
        if (request.tenantClaimMap() != null) {
            next.tenantClaimMap = new java.util.LinkedHashMap<>(request.tenantClaimMap());
        }
        if (request.defaultOidcRoleKey() != null && !request.defaultOidcRoleKey().isBlank()) {
            next.defaultOidcRoleKey = request.defaultOidcRoleKey().trim();
        }
        if (request.autoProvisionMembership() != null) {
            next.autoProvisionMembership = request.autoProvisionMembership();
        }
        if (request.roleClaim() != null) {
            next.roleClaim = request.roleClaim().trim();
        }
        if (request.roleClaimMap() != null) {
            next.roleClaimMap = new java.util.LinkedHashMap<>(request.roleClaimMap());
        }
        if (request.syncRolesFromClaim() != null) {
            next.syncRolesFromClaim = request.syncRolesFromClaim();
        }
        if (request.deprovisionMissingRoleClaim() != null) {
            next.deprovisionMissingRoleClaim = request.deprovisionMissingRoleClaim();
        }
        return toDto(oidcConfigStore.save(next));
    }

    public String beginAuthorizationUrl() {
        StoredOidcConfig config = oidcConfigStore.current();
        if (!config.enabled) {
            throw new IllegalArgumentException("OIDC_DISABLED");
        }
        purgeExpired();
        String state = randomUrlSafe(24);
        String verifier = randomUrlSafe(32);
        String challenge = pkceChallenge(verifier);
        pending.put(state, new PendingAuth(verifier, Instant.now().plus(STATE_TTL)));
        String authorizeEndpoint = discovery(config.issuer).authorizationEndpoint();
        StringBuilder url = new StringBuilder(authorizeEndpoint)
                .append(authorizeEndpoint.contains("?") ? "&" : "?")
                .append("response_type=code")
                .append("&client_id=").append(enc(config.clientId))
                .append("&redirect_uri=").append(enc(config.redirectUri))
                .append("&scope=").append(enc(config.scopes))
                .append("&state=").append(enc(state))
                .append("&code_challenge=").append(enc(challenge))
                .append("&code_challenge_method=S256");
        return url.toString();
    }

    public LoginResult handleCallback(String code, String state) {
        if (code == null || code.isBlank() || state == null || state.isBlank()) {
            throw new IllegalArgumentException("OIDC_INVALID_CALLBACK");
        }
        purgeExpired();
        PendingAuth pendingAuth = pending.remove(state.trim());
        if (pendingAuth == null || pendingAuth.expiresAt().isBefore(Instant.now())) {
            throw new IllegalArgumentException("OIDC_STATE_EXPIRED");
        }
        StoredOidcConfig config = oidcConfigStore.current();
        if (!config.enabled) {
            throw new IllegalArgumentException("OIDC_DISABLED");
        }
        Discovery discovery = discovery(config.issuer);
        JsonNode token = exchangeCode(discovery.tokenEndpoint(), config, code.trim(), pendingAuth.verifier());
        String idToken = text(token, "id_token");
        JsonNode claims = idTokenVerifier.verify(idToken, config.issuer, config.clientId, discovery.jwksUri());
        String email = firstNonBlank(text(claims, "email"), text(claims, "preferred_username"));
        String preferredUsername = firstNonBlank(text(claims, "preferred_username"), email, text(claims, "sub"));
        String displayName = firstNonBlank(text(claims, "name"), preferredUsername);
        if (preferredUsername == null || preferredUsername.isBlank()) {
            throw new IllegalArgumentException("OIDC_USER_CLAIM_MISSING");
        }
        UserEntity user = resolveOrCreateUser(preferredUsername, email, displayName);
        String preferredTenantId = resolveOidcTenantId(config, claims);
        ensureOidcMembership(user, preferredTenantId, config);
        syncOidcDirectory(user, preferredTenantId, config, claims);
        return authService.createSessionForUser(user, "OIDC", preferredTenantId);
    }

    /**
     * single → default；multi → claim 映射 / claim 值当 slug / 回退 default（须可访问）。
     */
    String resolveOidcTenantId(StoredOidcConfig config, JsonNode claims) {
        if (tenancyProperties.isSingleMode()) {
            return TenantIds.normalizeOrDefault(tenancyProperties.getDefaultTenantId());
        }
        String claimName = config.tenantClaim != null && !config.tenantClaim.isBlank()
                ? config.tenantClaim.trim()
                : "org_id";
        String claimValue = text(claims, claimName);
        if (claimValue == null || claimValue.isBlank()) {
            // 兼容常见 org 数组 claim
            claimValue = firstArrayText(claims, claimName);
        }
        if (claimValue != null && !claimValue.isBlank()) {
            Map<String, String> map = config.tenantClaimMap != null ? config.tenantClaimMap : Map.of();
            String mapped = map.get(claimValue);
            if (mapped == null) {
                mapped = map.get(claimValue.toLowerCase());
            }
            String candidate = mapped != null && !mapped.isBlank() ? mapped.trim() : claimValue.trim();
            Optional<TenantEntity> byId = tenantStore.findTenantById(candidate);
            if (byId.isPresent()) {
                tenantService.requireActiveTenant(byId.get().getId());
                return byId.get().getId();
            }
            Optional<TenantEntity> bySlug = tenantStore.listTenants().stream()
                    .filter(t -> candidate.equalsIgnoreCase(t.getSlug()))
                    .findFirst();
            if (bySlug.isPresent()) {
                tenantService.requireActiveTenant(bySlug.get().getId());
                return bySlug.get().getId();
            }
            throw new IllegalArgumentException("OIDC_TENANT_UNMAPPED");
        }
        return TenantIds.normalizeOrDefault(tenancyProperties.getDefaultTenantId());
    }

    void ensureOidcMembership(UserEntity user, String tenantId, StoredOidcConfig config) {
        if (user == null || user.isGuest()) {
            return;
        }
        String id = TenantIds.normalizeOrDefault(tenantId);
        if (tenantStore.findMembership(user.getId(), id).isPresent()) {
            return;
        }
        if (!config.autoProvisionMembership) {
            if (tenancyProperties.isMultiMode()) {
                throw new IllegalArgumentException("OIDC_TENANT_MEMBERSHIP_REQUIRED");
            }
            return;
        }
        String roleKey = config.defaultOidcRoleKey != null && !config.defaultOidcRoleKey.isBlank()
                ? config.defaultOidcRoleKey.trim()
                : TenantIds.ROLE_DEVELOPER;
        TenantRoleEntity role = tenantStore.findRoleByKey(id, roleKey)
                .or(() -> tenantStore.findRoleByKey(id, TenantIds.ROLE_DEVELOPER))
                .orElseThrow(() -> new IllegalArgumentException("OIDC_ROLE_MISSING"));
        UserTenantMembership membership = new UserTenantMembership();
        membership.setUserId(user.getId());
        membership.setTenantId(id);
        membership.setStatus("active");
        membership.setJoinedAt(Instant.now());
        membership.setRoleIds(List.of(role.getId()));
        tenantStore.saveMembership(membership);
        log.info("OIDC provisioned membership userId={} tenantId={} role={}", user.getId(), id, role.getKey());
    }

    /**
     * Sync tenant roles from IdP groups claim; optionally disable membership when groups are gone.
     */
    void syncOidcDirectory(UserEntity user, String tenantId, StoredOidcConfig config, JsonNode claims) {
        if (user == null || user.isGuest() || !config.syncRolesFromClaim) {
            return;
        }
        String id = TenantIds.normalizeOrDefault(tenantId);
        Optional<UserTenantMembership> existing = tenantStore.findMembership(user.getId(), id);
        if (existing.isEmpty()) {
            return;
        }
        List<String> claimValues = claimValues(claims, config.roleClaim);
        List<String> roleKeys = mapClaimValuesToRoleKeys(claimValues, config.roleClaimMap);
        List<String> roleIds = resolveRoleIds(id, roleKeys);
        UserTenantMembership membership = existing.get();
        if (!roleIds.isEmpty()) {
            membership.setStatus("active");
            membership.setRoleIds(roleIds);
            tenantStore.saveMembership(membership);
            log.info("OIDC synced roles userId={} tenantId={} roles={}", user.getId(), id, roleKeys);
            return;
        }
        if (!config.deprovisionMissingRoleClaim) {
            return;
        }
        membership.setStatus("disabled");
        tenantStore.saveMembership(membership);
        authService.revokeSessionsForUser(user.getId());
        log.info("OIDC deprovisioned membership userId={} tenantId={} (no mapped groups)", user.getId(), id);
    }

    static List<String> claimValues(JsonNode claims, String claimName) {
        if (claims == null || claimName == null || claimName.isBlank()) {
            return List.of();
        }
        String field = claimName.trim();
        if (!claims.has(field) || claims.get(field).isNull()) {
            return List.of();
        }
        JsonNode node = claims.get(field);
        List<String> values = new ArrayList<>();
        if (node.isArray()) {
            for (JsonNode item : node) {
                if (item != null && item.isTextual() && !item.asText().isBlank()) {
                    values.add(item.asText().trim());
                } else if (item != null && item.isNumber()) {
                    values.add(item.asText());
                }
            }
            return values;
        }
        String single = text(claims, field);
        if (single == null || single.isBlank()) {
            return List.of();
        }
        if (single.contains(",")) {
            for (String part : single.split(",")) {
                if (part != null && !part.isBlank()) {
                    values.add(part.trim());
                }
            }
            return values;
        }
        values.add(single.trim());
        return values;
    }

    static List<String> mapClaimValuesToRoleKeys(List<String> claimValues, Map<String, String> roleClaimMap) {
        if (claimValues == null || claimValues.isEmpty()) {
            return List.of();
        }
        Map<String, String> map = roleClaimMap != null ? roleClaimMap : Map.of();
        LinkedHashSet<String> keys = new LinkedHashSet<>();
        for (String value : claimValues) {
            if (value == null || value.isBlank()) {
                continue;
            }
            String mapped = map.get(value);
            if (mapped == null) {
                mapped = map.get(value.toLowerCase(Locale.ROOT));
            }
            if (mapped != null && !mapped.isBlank()) {
                keys.add(mapped.trim());
            } else if (map.isEmpty()) {
                // No map configured: treat claim values as tenant role keys directly.
                keys.add(value.trim());
            }
        }
        return List.copyOf(keys);
    }

    private List<String> resolveRoleIds(String tenantId, List<String> roleKeys) {
        if (roleKeys == null || roleKeys.isEmpty()) {
            return List.of();
        }
        List<String> roleIds = new ArrayList<>();
        for (String key : roleKeys) {
            tenantStore.findRoleByKey(tenantId, key)
                    .ifPresent(role -> roleIds.add(role.getId()));
        }
        return roleIds;
    }

    private static String firstArrayText(JsonNode claims, String field) {
        if (claims == null || !claims.has(field) || !claims.get(field).isArray()) {
            return null;
        }
        for (JsonNode item : claims.get(field)) {
            if (item != null && item.isTextual() && !item.asText().isBlank()) {
                return item.asText().trim();
            }
        }
        return null;
    }

    public String frontendRedirectBase() {
        StoredOidcConfig config = oidcConfigStore.current();
        if (config.frontendRedirectBase != null && !config.frontendRedirectBase.isBlank()) {
            return config.frontendRedirectBase;
        }
        return "http://localhost:28413";
    }

    private UserEntity resolveOrCreateUser(String username, String email, String displayName) {
        Optional<UserEntity> byName = userStore.findByUsername(username);
        if (byName.isPresent()) {
            return byName.get();
        }
        if (email != null && !email.isBlank()) {
            Optional<UserEntity> byEmail = userStore.listRegisteredUsers().stream()
                    .filter(user -> email.equalsIgnoreCase(user.getEmail()))
                    .findFirst();
            if (byEmail.isPresent()) {
                return byEmail.get();
            }
        }
        long nextId = userStore.listAllUsers().stream()
                .map(UserEntity::getId)
                .filter(id -> id != null)
                .mapToLong(Long::longValue)
                .max()
                .orElse(0L) + 1L;
        Instant now = Instant.now();
        UserEntity user = new UserEntity();
        user.setId(nextId);
        user.setUsername(username.trim());
        user.setEmail(email);
        user.setDisplayName(displayName != null ? displayName : username);
        user.setGuest(false);
        user.setPasswordHash(null);
        user.setFeaturePermissions(userPermissionPolicy.resolveEffectivePermissions(user));
        user.setCreatedAt(now);
        user.setUpdatedAt(now);
        return userStore.saveUser(user);
    }

    private JsonNode exchangeCode(String tokenEndpoint, StoredOidcConfig config, String code, String verifier) {
        try {
            String body = "grant_type=authorization_code"
                    + "&code=" + enc(code)
                    + "&redirect_uri=" + enc(config.redirectUri)
                    + "&client_id=" + enc(config.clientId)
                    + "&code_verifier=" + enc(verifier);
            if (config.clientSecret != null && !config.clientSecret.isBlank()) {
                body += "&client_secret=" + enc(config.clientSecret);
            }
            HttpRequest request = HttpRequest.newBuilder(URI.create(tokenEndpoint))
                    .timeout(Duration.ofSeconds(20))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalArgumentException("OIDC_TOKEN_EXCHANGE_FAILED");
            }
            return objectMapper.readTree(response.body());
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("OIDC token exchange failed: {}", ex.toString());
            throw new IllegalArgumentException("OIDC_TOKEN_EXCHANGE_FAILED");
        }
    }

    private Discovery discovery(String issuer) {
        String normalized = issuer.endsWith("/") ? issuer.substring(0, issuer.length() - 1) : issuer;
        String url = normalized + "/.well-known/openid-configuration";
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(15))
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalArgumentException("OIDC_DISCOVERY_FAILED");
            }
            JsonNode node = objectMapper.readTree(response.body());
            return new Discovery(
                    text(node, "authorization_endpoint"),
                    text(node, "token_endpoint"),
                    text(node, "jwks_uri"));
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("OIDC_DISCOVERY_FAILED");
        }
    }

    private void purgeExpired() {
        Instant now = Instant.now();
        pending.entrySet().removeIf(entry -> entry.getValue().expiresAt().isBefore(now));
    }

    private String randomUrlSafe(int bytes) {
        byte[] buffer = new byte[bytes];
        secureRandom.nextBytes(buffer);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buffer);
    }

    private static String pkceChallenge(String verifier) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (Exception ex) {
            throw new IllegalStateException("PKCE challenge failed", ex);
        }
    }

    private static String enc(String value) {
        return URLEncoder.encode(value != null ? value : "", StandardCharsets.UTF_8);
    }

    private static String text(JsonNode node, String field) {
        if (node == null || !node.has(field) || node.get(field).isNull()) {
            return null;
        }
        String value = node.get(field).asText(null);
        return value != null && !value.isBlank() ? value.trim() : null;
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private static OidcConfigDto toDto(StoredOidcConfig config) {
        return new OidcConfigDto(
                config.enabled,
                config.issuer,
                config.clientId,
                config.clientSecret != null && !config.clientSecret.isBlank(),
                config.redirectUri,
                config.frontendRedirectBase,
                config.scopes,
                config.localLoginEnabled,
                config.tenantClaim,
                config.tenantClaimMap != null ? Map.copyOf(config.tenantClaimMap) : Map.of(),
                config.defaultOidcRoleKey,
                config.autoProvisionMembership,
                config.roleClaim,
                config.roleClaimMap != null ? Map.copyOf(config.roleClaimMap) : Map.of(),
                config.syncRolesFromClaim,
                config.deprovisionMissingRoleClaim);
    }

    private record PendingAuth(String verifier, Instant expiresAt) {
    }

    private record Discovery(String authorizationEndpoint, String tokenEndpoint, String jwksUri) {
    }
}
