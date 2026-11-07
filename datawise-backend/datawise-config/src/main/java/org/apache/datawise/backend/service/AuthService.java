package org.apache.datawise.backend.service;

import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.AuthSessionPolicyService;
import org.apache.datawise.backend.configstore.OidcConfigStore;
import org.apache.datawise.backend.configstore.SchemaCacheStore;
import org.apache.datawise.backend.configstore.SessionStore;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.domain.AuthSessionPolicyDto;
import org.apache.datawise.backend.domain.CreateTenantRequest;
import org.apache.datawise.backend.domain.LoginResult;
import org.apache.datawise.backend.domain.RegisterRequest;
import org.apache.datawise.backend.domain.SessionInfo;
import org.apache.datawise.backend.domain.SwitchTenantRequest;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.domain.TenantSummaryDto;
import org.apache.datawise.backend.model.SessionEntity;
import org.apache.datawise.backend.model.TenantEntity;
import org.apache.datawise.backend.model.TenantRoleEntity;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.model.UserTenantMembership;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.service.auth.DefaultCredentialsStartupWarning;
import org.apache.datawise.backend.service.auth.LoginAttemptGuard;
import org.apache.datawise.backend.service.tenant.PlatformAdminPolicy;
import org.apache.datawise.backend.service.tenant.TenantService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
public class AuthService {

    private final UserStore userStore;
    private final SessionStore sessionStore;
    private final AuthSessionPolicyService sessionPolicy;
    private final OidcConfigStore oidcConfigStore;
    private final PasswordEncoder passwordEncoder;
    private final GuestSessionCleanupService guestSessionCleanupService;
    private final UserAccessPolicy userAccessPolicy;
    private final UserAdminPolicy userAdminPolicy;
    private final UserPermissionPolicy userPermissionPolicy;
    private final TenancyProperties tenancyProperties;
    private final TenantStore tenantStore;
    private final TenantService tenantService;
    private final PlatformAdminPolicy platformAdminPolicy;
    private final SchemaCacheStore schemaCacheStore;
    private final LoginAttemptGuard loginAttemptGuard;

    public AuthService(
                       UserStore userStore,
                       SessionStore sessionStore,
                       AuthSessionPolicyService sessionPolicy,
                       OidcConfigStore oidcConfigStore,
                       PasswordEncoder passwordEncoder,
                       GuestSessionCleanupService guestSessionCleanupService,
                       UserAccessPolicy userAccessPolicy,
                       UserAdminPolicy userAdminPolicy,
                       UserPermissionPolicy userPermissionPolicy,
                       TenancyProperties tenancyProperties,
                       TenantStore tenantStore,
                       TenantService tenantService,
                       PlatformAdminPolicy platformAdminPolicy,
                       SchemaCacheStore schemaCacheStore,
                       LoginAttemptGuard loginAttemptGuard) {
        this.userStore = userStore;
        this.sessionStore = sessionStore;
        this.sessionPolicy = sessionPolicy;
        this.oidcConfigStore = oidcConfigStore;
        this.passwordEncoder = passwordEncoder;
        this.guestSessionCleanupService = guestSessionCleanupService;
        this.userAccessPolicy = userAccessPolicy;
        this.userAdminPolicy = userAdminPolicy;
        this.userPermissionPolicy = userPermissionPolicy;
        this.tenancyProperties = tenancyProperties;
        this.tenantStore = tenantStore;
        this.tenantService = tenantService;
        this.platformAdminPolicy = platformAdminPolicy;
        this.schemaCacheStore = schemaCacheStore;
        this.loginAttemptGuard = loginAttemptGuard;
    }

    public LoginResult login(String userName, String password) {
        if (!oidcConfigStore.current().localLoginEnabled) {
            throw new IllegalArgumentException("LOCAL_LOGIN_DISABLED");
        }
        loginAttemptGuard.assertNotLocked(userName);
        UserEntity user = userStore.findByUsername(userName.trim())
                .orElse(null);
        if (user == null || user.isGuest() || user.getPasswordHash() == null
                || !passwordEncoder.matches(password, user.getPasswordHash())) {
            loginAttemptGuard.recordFailure(userName);
            throw new IllegalArgumentException("INVALID_CREDENTIALS");
        }
        loginAttemptGuard.clearFailures(userName);
        invalidateCurrentSessionIfPresent();
        return createSessionForUser(user, "LOCAL");
    }

    public LoginResult loginAsGuest() {
        if (!oidcConfigStore.current().localLoginEnabled) {
            throw new IllegalArgumentException("LOCAL_LOGIN_DISABLED");
        }
        invalidateCurrentSessionIfPresent();
        UserEntity guest = userStore.findByUsername("guest")
                .orElseThrow(() -> new IllegalStateException("Guest user missing in config/users.json"));
        return createSessionForUser(guest, "LOCAL");
    }

    /**
     * 公开注册：创建本地账号；可选同时开通组织（需 {@code allow-tenant-create} + multi）。
     */
    public LoginResult register(RegisterRequest request) {
        if (!tenancyProperties.isAllowRegistration()) {
            throw new IllegalArgumentException("REGISTRATION_DISABLED");
        }
        if (!oidcConfigStore.current().localLoginEnabled) {
            throw new IllegalArgumentException("LOCAL_LOGIN_DISABLED");
        }
        if (request == null || request.userName() == null || request.userName().isBlank()) {
            throw new IllegalArgumentException("USERNAME_REQUIRED");
        }
        if (request.password() == null || request.password().length() < 6) {
            throw new IllegalArgumentException("PASSWORD_TOO_SHORT");
        }
        String username = request.userName().trim();
        if ("guest".equalsIgnoreCase(username)) {
            throw new IllegalArgumentException("USERNAME_RESERVED");
        }
        if (userStore.findByUsername(username).isPresent()) {
            throw new IllegalArgumentException("USERNAME_TAKEN");
        }
        Instant now = Instant.now();
        long nextId = userStore.listAllUsers().stream()
                .map(UserEntity::getId)
                .filter(id -> id != null)
                .mapToLong(Long::longValue)
                .max()
                .orElse(0L) + 1L;
        UserEntity user = new UserEntity();
        user.setId(nextId);
        user.setUsername(username);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setGuest(false);
        user.setEmail(request.email() != null && !request.email().isBlank() ? request.email().trim() : null);
        user.setDisplayName(request.displayName() != null && !request.displayName().isBlank()
                ? request.displayName().trim()
                : username);
        user.setFeaturePermissions(Map.of());
        user.setCreatedAt(now);
        user.setUpdatedAt(now);
        userStore.saveUser(user);

        boolean createOrg = Boolean.TRUE.equals(request.createTenant())
                && tenancyProperties.isMultiMode()
                && tenancyProperties.isAllowTenantCreate()
                && request.tenantName() != null
                && !request.tenantName().isBlank();
        String preferredTenantId;
        if (createOrg) {
            UserContext.set(user.getId(), false, "register-" + user.getId(), TenantIds.DEFAULT);
            try {
                preferredTenantId = tenantService.createTenant(new CreateTenantRequest(
                        request.tenantName().trim(),
                        request.tenantSlug(),
                        user.getId())).id();
            } finally {
                UserContext.clear();
            }
        } else {
            preferredTenantId = TenantIds.normalizeOrDefault(tenancyProperties.getDefaultTenantId());
            // First registered account on an empty workspace becomes tenant admin (packaged installs
            // ship guest-only seeds without sample password hashes).
            if (isFirstRegisteredUser(user.getId())) {
                ensureTenantAdminMembership(user.getId(), preferredTenantId);
            } else {
                ensureDeveloperMembership(user.getId(), preferredTenantId);
            }
        }
        invalidateCurrentSessionIfPresent();
        return createSessionForUser(user, "LOCAL", preferredTenantId);
    }

    private boolean isFirstRegisteredUser(long userId) {
        return userStore.listRegisteredUsers().stream()
                .allMatch(existing -> existing.getId() != null && existing.getId().equals(userId));
    }

    private void ensureTenantAdminMembership(long userId, String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        if (tenantStore.findMembership(userId, id).isPresent()) {
            return;
        }
        TenantRoleEntity role = tenantStore.findRoleByKey(id, TenantIds.ROLE_TENANT_ADMIN)
                .or(() -> tenantStore.findRoleById(id, TenantIds.ROLE_ID_TENANT_ADMIN))
                .orElseThrow(() -> new IllegalStateException("tenant_admin role missing for tenant " + id));
        UserTenantMembership membership = new UserTenantMembership();
        membership.setUserId(userId);
        membership.setTenantId(id);
        membership.setStatus("active");
        membership.setJoinedAt(Instant.now());
        membership.setRoleIds(List.of(role.getId()));
        tenantStore.saveMembership(membership);
    }

    private void ensureDeveloperMembership(long userId, String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        if (tenantStore.findMembership(userId, id).isPresent()) {
            return;
        }
        TenantRoleEntity role = tenantStore.findRoleByKey(id, TenantIds.ROLE_DEVELOPER)
                .or(() -> tenantStore.findRoleById(id, TenantIds.ROLE_ID_DEVELOPER))
                .orElseThrow(() -> new IllegalStateException("developer role missing for tenant " + id));
        UserTenantMembership membership = new UserTenantMembership();
        membership.setUserId(userId);
        membership.setTenantId(id);
        membership.setStatus("active");
        membership.setJoinedAt(Instant.now());
        membership.setRoleIds(List.of(role.getId()));
        tenantStore.saveMembership(membership);
    }

    public void signOut() {
        if (UserContext.isApiTokenAuth()) {
            return;
        }
        String sessionId = UserContext.getSessionId();
        boolean guest = userAccessPolicy.isGuestSession();
        if (sessionId != null) {
            guestSessionCleanupService.cleanupSession(sessionId, guest);
            sessionStore.deleteById(sessionId);
        }
    }

    public SessionInfo getCurrentSession() {
        Long userId = UserContext.requireUserId();
        UserEntity user = userStore.findById(userId)
                .orElseThrow(() -> new UnauthorizedException());
        if (UserContext.isApiTokenAuth()) {
            String tenantId = UserContext.getTenantId();
            return buildSessionInfo(
                    UserContext.getSessionId(),
                    user,
                    false,
                    null,
                    tenantId);
        }
        SessionEntity session = sessionStore.findById(UserContext.getSessionId())
                .orElseThrow(() -> new UnauthorizedException());
        return buildSessionInfo(
                session.getId(),
                user,
                session.isGuest(),
                toEpochMs(session.getExpiresAt()),
                TenantIds.normalizeOrDefault(session.getTenantId()));
    }

    public SessionInfo switchTenant(SwitchTenantRequest request) {
        if (UserContext.isApiTokenAuth()) {
            throw new UnauthorizedException();
        }
        userAccessPolicy.requireRegisteredUser();
        if (request == null || request.tenantId() == null || request.tenantId().isBlank()) {
            throw new IllegalArgumentException("tenantId is required");
        }
        if (tenancyProperties.isSingleMode()) {
            throw new IllegalArgumentException("TENANCY_MULTI_REQUIRED");
        }
        String tenantId = TenantIds.normalizeOrDefault(request.tenantId());
        Long userId = UserContext.requireUserId();
        if (!tenantService.userCanAccessTenant(userId, tenantId)) {
            throw new IllegalArgumentException("TENANT_ACCESS_DENIED");
        }
        tenantService.requireActiveTenant(tenantId);
        SessionEntity session = sessionStore.findById(UserContext.getSessionId())
                .orElseThrow(() -> new UnauthorizedException());
        session.setTenantId(tenantId);
        sessionStore.save(session);
        UserContext.set(userId, session.isGuest(), session.getId(), tenantId);
        schemaCacheStore.clearSession(session.getId());
        UserEntity user = userStore.findById(userId).orElseThrow(() -> new UnauthorizedException());
        return buildSessionInfo(
                session.getId(),
                user,
                session.isGuest(),
                toEpochMs(session.getExpiresAt()),
                tenantId);
    }

    public AuthSessionPolicyDto getSessionPolicy() {
        userAccessPolicy.requireUserId();
        return sessionPolicy.currentPolicy();
    }

    public AuthSessionPolicyDto updateSessionPolicy(AuthSessionPolicyDto policy) {
        userAdminPolicy.requireAdminUser();
        return sessionPolicy.updatePolicy(policy);
    }

    public void changePassword(String currentPassword, String newPassword) {
        if (UserContext.isApiTokenAuth()) {
            throw new UnauthorizedException();
        }
        userAccessPolicy.requireRegisteredUser();
        Long userId = userAccessPolicy.requireUserId();
        UserEntity user = userStore.findById(userId)
                .orElseThrow(() -> new IllegalStateException("User not found"));
        if (currentPassword == null || user.getPasswordHash() == null
                || !passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new IllegalArgumentException("INVALID_PASSWORD");
        }
        if (newPassword == null || newPassword.length() < 6) {
            throw new IllegalArgumentException("PASSWORD_TOO_SHORT");
        }
        if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            throw new IllegalArgumentException("PASSWORD_UNCHANGED");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setUpdatedAt(Instant.now());
        userStore.saveUser(user);
    }

    /** Verify the current user's local password without rotating the session. */
    public void verifyPassword(String password) {
        if (UserContext.isApiTokenAuth()) {
            throw new UnauthorizedException();
        }
        userAccessPolicy.requireRegisteredUser();
        Long userId = userAccessPolicy.requireUserId();
        UserEntity user = userStore.findById(userId)
                .orElseThrow(() -> new IllegalStateException("User not found"));
        if (user.getPasswordHash() == null || user.getPasswordHash().isBlank()) {
            throw new IllegalArgumentException("PASSWORD_NOT_SET");
        }
        if (password == null || !passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new IllegalArgumentException("INVALID_PASSWORD");
        }
    }

    private void invalidateCurrentSessionIfPresent() {
        String sessionId = UserContext.getSessionId();
        if (sessionId == null || sessionId.isBlank() || UserContext.isApiTokenAuth()) {
            return;
        }
        guestSessionCleanupService.cleanupSession(sessionId, userAccessPolicy.isGuestSession());
        sessionStore.deleteById(sessionId);
    }

    /** Force-logout all sessions for a user (OIDC deprovision / admin revoke). */
    public void revokeSessionsForUser(long userId) {
        sessionStore.deleteByUserId(userId);
    }

    public LoginResult createSessionForUser(UserEntity user, String securityConfigType) {
        return createSessionForUser(user, securityConfigType, null);
    }

    public LoginResult createSessionForUser(UserEntity user, String securityConfigType, String preferredTenantId) {
        invalidateCurrentSessionIfPresent();
        String tenantId = resolveLoginTenantId(user, preferredTenantId);
        SessionEntity session = new SessionEntity();
        session.setId(IdGenerator.secureToken("session-"));
        session.setUserId(user.getId());
        session.setGuest(user.isGuest());
        session.setTenantId(tenantId);
        SessionEntity saved = sessionStore.create(session);
        String provider = securityConfigType != null && !securityConfigType.isBlank()
                ? securityConfigType.trim()
                : "LOCAL";
        UserContext.set(user.getId(), user.isGuest(), saved.getId(), tenantId);
        SessionInfo info = buildSessionInfo(
                saved.getId(),
                user,
                user.isGuest(),
                toEpochMs(saved.getExpiresAt()),
                tenantId);
        return new LoginResult(
                info.sessionId(),
                info.userName(),
                provider,
                info.expiresAtEpochMs(),
                info.userId(),
                info.admin(),
                info.featurePermissions(),
                info.tenantId(),
                info.tenantName(),
                info.tenancyMode(),
                info.platformAdmin(),
                info.tenants(),
                info.mustChangePassword());
    }

    private SessionInfo buildSessionInfo(
                                         String sessionId,
                                         UserEntity user,
                                         boolean guest,
                                         Long expiresAtEpochMs,
                                         String tenantId) {
        String normalizedTenant = TenantIds.normalizeOrDefault(tenantId);
        List<TenantSummaryDto> tenants = guest
                ? List.of()
                : tenantService.listActiveSummariesForUser(user.getId());
        String tenantName = tenantStore.findTenantById(normalizedTenant)
                .map(TenantEntity::getName)
                .orElse(normalizedTenant);
        String mode = tenancyProperties.isMultiMode() ? "multi" : "single";
        boolean platformAdmin = !guest && platformAdminPolicy.isPlatformAdmin(user.getId());
        boolean hasLocalPassword = !guest
                && user.getPasswordHash() != null
                && !user.getPasswordHash().isBlank();
        boolean mustChangePassword = !guest && usesShippedSamplePassword(user);
        return new SessionInfo(
                sessionId,
                user.getUsername(),
                guest,
                expiresAtEpochMs,
                user.getId(),
                userAdminPolicy.isAdminUser(user.getId()),
                userPermissionPolicy.resolveEffectivePermissions(user),
                normalizedTenant,
                tenantName,
                mode,
                platformAdmin,
                tenants,
                hasLocalPassword,
                mustChangePassword);
    }

    public static boolean usesShippedSamplePassword(UserEntity user) {
        if (user == null || user.isGuest()) {
            return false;
        }
        String hash = user.getPasswordHash();
        return hash != null && hash.equals(DefaultCredentialsStartupWarning.SHIPPED_SAMPLE_PASSWORD_HASH);
    }

    private String resolveLoginTenantId(UserEntity user) {
        return resolveLoginTenantId(user, null);
    }

    private String resolveLoginTenantId(UserEntity user, String preferredTenantId) {
        if (user.isGuest()) {
            return TenantIds.normalizeOrDefault(tenancyProperties.getDefaultTenantId());
        }
        String defaultId = TenantIds.normalizeOrDefault(tenancyProperties.getDefaultTenantId());
        if (tenancyProperties.isSingleMode()) {
            if (tenantService.userCanAccessTenant(user.getId(), defaultId)) {
                return defaultId;
            }
            throw new IllegalArgumentException("TENANT_ACCESS_DENIED");
        }
        if (preferredTenantId != null && !preferredTenantId.isBlank()) {
            String preferred = TenantIds.normalizeOrDefault(preferredTenantId);
            if (tenantService.userCanAccessTenant(user.getId(), preferred)) {
                tenantService.requireActiveTenant(preferred);
                return preferred;
            }
        }
        List<TenantSummaryDto> memberships = tenantService.listActiveSummariesForUser(user.getId());
        for (TenantSummaryDto summary : memberships) {
            if (defaultId.equals(summary.id())) {
                return defaultId;
            }
        }
        if (!memberships.isEmpty()) {
            return memberships.get(0).id();
        }
        throw new IllegalArgumentException("TENANT_ACCESS_DENIED");
    }

    private static Long toEpochMs(Instant instant) {
        return instant != null ? instant.toEpochMilli() : null;
    }
}
