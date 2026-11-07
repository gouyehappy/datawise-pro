package org.apache.datawise.backend.security;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class HeadlessRuntimeAuthTest {

    @Mock
    UserAdminPolicy adminPolicy;

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void sessionDefersToAdminPolicy() {
        UserContext.set(1L, false, "session-admin");
        assertDoesNotThrow(() -> HeadlessRuntimeAuth.requireRuntimeManageAccess(adminPolicy));
        verify(adminPolicy).requireAdminUser();
    }

    @Test
    void apiTokenWithRuntimeScopePasses() {
        UserContext.setApiToken(1L, "token-1", Set.of(ApiTokenScopes.RUNTIME));
        assertDoesNotThrow(() -> HeadlessRuntimeAuth.requireRuntimeManageAccess(adminPolicy));
        verify(adminPolicy, never()).requireAdminUser();
    }

    @Test
    void apiTokenWithoutRuntimeScopeRejected() {
        UserContext.setApiToken(1L, "token-1", Set.of(ApiTokenScopes.SQL));
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> HeadlessRuntimeAuth.requireRuntimeManageAccess(adminPolicy));
        assertEquals(HeadlessMigrationAuth.API_TOKEN_FORBIDDEN, ex.getMessage());
        verify(adminPolicy, never()).requireAdminUser();
    }

    @Test
    void nullAdminPolicyRejectedForSession() {
        UserContext.set(1L, false, "session");
        assertThrows(UnauthorizedException.class, () -> HeadlessRuntimeAuth.requireRuntimeManageAccess(null));
    }
}
