package org.apache.datawise.backend.security;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserContextTest {

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void runAs_restoresUserOnWorkerThread() {
        UserContext.set(9L, false, "session-worker");

        Long seen = UserContext.runAs(new UserContext.Snapshot(9L, false, "session-worker"), () -> {
            assertEquals(9L, UserContext.requireUserId());
            return UserContext.getUserId();
        });

        assertEquals(9L, seen);
        assertEquals(9L, UserContext.getUserId());
    }

    @Test
    void runAs_nullSnapshotLeavesExistingContextUnchanged() {
        UserContext.set(3L, true, "session-guest");

        UserContext.runAs((UserContext.Snapshot) null, () -> {
            assertEquals(3L, UserContext.getUserId());
        });

        assertEquals(3L, UserContext.getUserId());
    }

    @Test
    void snapshotOrNull_returnsNullWithoutAuthenticatedUser() {
        assertNull(UserContext.snapshotOrNull());
    }

    @Test
    void requireUserId_throwsUnauthorizedWhenMissing() {
        UnauthorizedException ex = assertThrows(UnauthorizedException.class, UserContext::requireUserId);
        assertEquals(UnauthorizedException.CODE, ex.getMessage());
    }

    @Test
    void runAs_preservesApiTokenScopesOnWorkerThread() {
        UserContext.setApiToken(5L, "token-1", Set.of("sql", "migration"));

        UserContext.runAs(UserContext.snapshotOrNull(), () -> {
            assertTrue(UserContext.isApiTokenAuth());
            assertTrue(UserContext.hasApiTokenScope("sql"));
            assertTrue(UserContext.hasApiTokenScope("migration"));
        });

        assertTrue(UserContext.hasApiTokenScope("sql"));
    }

    @Test
    void snapshotOrNull_capturesApiTokenScopes() {
        UserContext.setApiToken(8L, "token-2", Set.of("migration"));

        UserContext.Snapshot snapshot = UserContext.snapshotOrNull();

        assertEquals(8L, snapshot.userId());
        assertEquals(Set.of("migration"), snapshot.apiTokenScopes());
    }
}
