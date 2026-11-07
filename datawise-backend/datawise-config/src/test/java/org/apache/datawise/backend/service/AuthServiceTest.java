package org.apache.datawise.backend.service;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.AuthSessionPolicyService;
import org.apache.datawise.backend.configstore.OidcConfigStore;
import org.apache.datawise.backend.configstore.SchemaCacheStore;
import org.apache.datawise.backend.configstore.SessionStore;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.domain.AuthSessionPolicyDto;
import org.apache.datawise.backend.model.SessionEntity;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.auth.LoginAttemptGuard;
import org.apache.datawise.backend.service.tenant.PlatformAdminPolicy;
import org.apache.datawise.backend.service.tenant.TenantService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserStore userStore;
    @Mock
    private SessionStore sessionStore;
    @Mock
    private AuthSessionPolicyService sessionPolicy;
    @Mock
    private OidcConfigStore oidcConfigStore;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private GuestSessionCleanupService guestSessionCleanupService;
    @Mock
    private UserAccessPolicy userAccessPolicy;
    @Mock
    private UserAdminPolicy userAdminPolicy;
    @Mock
    private UserPermissionPolicy userPermissionPolicy;
    @Mock
    private TenancyProperties tenancyProperties;
    @Mock
    private org.apache.datawise.backend.configstore.TenantStore tenantStore;
    @Mock
    private TenantService tenantService;
    @Mock
    private PlatformAdminPolicy platformAdminPolicy;

    @Mock
    private SchemaCacheStore schemaCacheStore;

    @Mock
    private LoginAttemptGuard loginAttemptGuard;

    @InjectMocks
    private AuthService authService;

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void signOut_deletesCurrentSession() {
        UserContext.set(1L, false, "session-to-delete");
        when(userAccessPolicy.isGuestSession()).thenReturn(false);

        authService.signOut();

        verify(guestSessionCleanupService).cleanupSession("session-to-delete", false);
        verify(sessionStore).deleteById("session-to-delete");
    }

    @Test
    void signOut_noOpWhenNoSessionInContext() {
        authService.signOut();

        verifyNoInteractions(sessionStore);
    }

    @Test
    void getCurrentSession_returnsSessionInfoForAuthenticatedUser() {
        UserEntity user = new UserEntity();
        user.setId(7L);
        user.setUsername("admin");
        user.setGuest(false);
        SessionEntity session = new SessionEntity();
        session.setId("session-abc");
        session.setUserId(7L);
        session.setGuest(false);
        session.setExpiresAt(java.time.Instant.now().plusSeconds(3600));
        UserContext.set(7L, false, "session-abc");
        when(userStore.findById(7L)).thenReturn(Optional.of(user));
        when(sessionStore.findById("session-abc")).thenReturn(Optional.of(session));
        when(userAdminPolicy.isAdminUser(7L)).thenReturn(true);
        when(userPermissionPolicy.resolveEffectivePermissions(user)).thenReturn(
                org.apache.datawise.backend.domain.UserFeaturePermission.fullPreset());
        when(tenancyProperties.isMultiMode()).thenReturn(false);
        when(platformAdminPolicy.isPlatformAdmin(7L)).thenReturn(true);
        when(tenantService.listActiveSummariesForUser(7L)).thenReturn(List.of());
        when(tenantStore.findTenantById(anyString())).thenReturn(Optional.empty());

        var info = authService.getCurrentSession();

        assertEquals("session-abc", info.sessionId());
        assertEquals("admin", info.userName());
        assertEquals(false, info.guest());
        assertEquals(7L, info.userId());
        assertEquals("default", info.tenantId());
    }

    @Test
    void getCurrentSession_unauthorizedWhenNoUserInContext() {
        UnauthorizedException ex = assertThrows(UnauthorizedException.class, authService::getCurrentSession);
        assertEquals(UnauthorizedException.CODE, ex.getMessage());
    }

    @Test
    void changePassword_rejectsApiTokenAuth() {
        UserContext.setApiToken(7L, "token-abc", java.util.Set.of());

        UnauthorizedException ex = assertThrows(
                UnauthorizedException.class,
                () -> authService.changePassword("old-pass", "new-pass-123"));
        assertEquals(UnauthorizedException.CODE, ex.getMessage());
        verifyNoInteractions(userStore);
    }

    @Test
    void verifyPassword_rejectsApiTokenAuth() {
        UserContext.setApiToken(7L, "token-abc", java.util.Set.of());

        UnauthorizedException ex = assertThrows(
                UnauthorizedException.class,
                () -> authService.verifyPassword("secret"));
        assertEquals(UnauthorizedException.CODE, ex.getMessage());
        verifyNoInteractions(userStore);
    }

    @Test
    void verifyPassword_acceptsMatchingPassword() {
        UserEntity user = new UserEntity();
        user.setId(7L);
        user.setUsername("admin");
        user.setPasswordHash("hashed");
        when(userAccessPolicy.requireUserId()).thenReturn(7L);
        when(userStore.findById(7L)).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("secret", "hashed")).thenReturn(true);

        authService.verifyPassword("secret");

        verify(passwordEncoder).matches("secret", "hashed");
    }

    @Test
    void verifyPassword_rejectsWrongPassword() {
        UserEntity user = new UserEntity();
        user.setId(7L);
        user.setUsername("admin");
        user.setPasswordHash("hashed");
        when(userAccessPolicy.requireUserId()).thenReturn(7L);
        when(userStore.findById(7L)).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("wrong", "hashed")).thenReturn(false);

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> authService.verifyPassword("wrong"));
        assertEquals("INVALID_PASSWORD", ex.getMessage());
    }

    @Test
    void verifyPassword_rejectsWhenPasswordNotSet() {
        UserEntity user = new UserEntity();
        user.setId(7L);
        user.setUsername("oidc-user");
        user.setPasswordHash(null);
        when(userAccessPolicy.requireUserId()).thenReturn(7L);
        when(userStore.findById(7L)).thenReturn(Optional.of(user));

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> authService.verifyPassword("anything"));
        assertEquals("PASSWORD_NOT_SET", ex.getMessage());
    }

    @Test
    void signOut_noOpForApiTokenAuth() {
        UserContext.setApiToken(7L, "token-abc", java.util.Set.of());

        authService.signOut();

        verifyNoInteractions(sessionStore);
        verifyNoInteractions(guestSessionCleanupService);
    }

    @Test
    void getCurrentSession_returnsSyntheticInfoForApiTokenAuth() {
        UserEntity user = new UserEntity();
        user.setId(7L);
        user.setUsername("automation");
        UserContext.setApiToken(7L, "token-abc", java.util.Set.of());
        when(userStore.findById(7L)).thenReturn(Optional.of(user));
        when(userAdminPolicy.isAdminUser(7L)).thenReturn(false);
        when(userPermissionPolicy.resolveEffectivePermissions(user)).thenReturn(
                org.apache.datawise.backend.domain.UserFeaturePermission.fullPreset());
        when(tenancyProperties.isMultiMode()).thenReturn(false);
        when(platformAdminPolicy.isPlatformAdmin(7L)).thenReturn(false);
        when(tenantService.listActiveSummariesForUser(7L)).thenReturn(List.of());
        when(tenantStore.findTenantById(anyString())).thenReturn(Optional.empty());

        var info = authService.getCurrentSession();

        assertEquals("api-token:token-abc", info.sessionId());
        assertEquals("automation", info.userName());
        assertEquals(false, info.guest());
        assertEquals(7L, info.userId());
        verifyNoInteractions(sessionStore);
    }

    @Test
    void getSessionPolicy_requiresAuthenticatedUser() {
        when(userAccessPolicy.requireUserId()).thenThrow(new UnauthorizedException());

        UnauthorizedException ex = assertThrows(UnauthorizedException.class, authService::getSessionPolicy);
        assertEquals(UnauthorizedException.CODE, ex.getMessage());
        verifyNoInteractions(sessionPolicy);
    }

    @Test
    void updateSessionPolicy_requiresAdminUser() {
        AuthSessionPolicyDto policy = new AuthSessionPolicyDto(120, true);
        when(sessionPolicy.updatePolicy(policy)).thenReturn(policy);

        AuthSessionPolicyDto updated = authService.updateSessionPolicy(policy);

        assertEquals(policy, updated);
        verify(userAdminPolicy).requireAdminUser();
        verify(sessionPolicy).updatePolicy(policy);
    }
}
