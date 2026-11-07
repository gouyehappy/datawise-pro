package org.apache.datawise.backend.service;

import org.apache.datawise.backend.security.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserResourcePolicyTest {

    private final UserAccessPolicy accessPolicy = new UserAccessPolicy();
    private final UserResourcePolicy policy = new UserResourcePolicy(accessPolicy);

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void guestCanWriteConnectionCatalogButNotAppConfig() {
        UserContext.set(1L, true, "guest-session");

        assertTrue(policy.canRead(UserResource.CONNECTION_CATALOG));
        assertTrue(policy.canWrite(UserResource.CONNECTION_CATALOG));

        assertFalse(policy.canRead(UserResource.APP_CONFIG));
        assertFalse(policy.canRead(UserResource.AI_PREFERENCES));
        assertFalse(policy.canWrite(UserResource.APP_CONFIG));
    }

    @Test
    void registeredUserCanWriteUserScopedResources() {
        UserContext.set(7L, false, "session-user");

        assertTrue(policy.canWrite(UserResource.APP_CONFIG));
        assertTrue(policy.canWrite(UserResource.AI_KNOWLEDGE));
        assertEquals(7L, policy.requireRegisteredUserIdFor(UserResource.APP_CONFIG));
    }

    @Test
    void registeredUserCanWriteWorkspaceUserData() {
        UserContext.set(7L, false, "session-user");
        assertTrue(policy.canWrite(UserResource.WORKSPACE_USER_DATA));
        assertEquals(7L, policy.requireRegisteredUserIdFor(UserResource.WORKSPACE_USER_DATA));
    }

    @Test
    void requireWrite_rejectsGuestOnAppConfig() {
        UserContext.set(1L, true, "guest-session");
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> policy.requireWrite(UserResource.APP_CONFIG));
        assertEquals(UserAccessPolicy.GUEST_NOT_ALLOWED, ex.getMessage());
    }

    @Test
    void requireSessionIdForConnectionCatalog() {
        UserContext.set(3L, true, "session-guest");
        assertEquals("session-guest", policy.requireSessionIdFor(UserResource.CONNECTION_CATALOG));
    }
}
