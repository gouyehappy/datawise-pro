package org.apache.datawise.backend.service;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.security.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@ExtendWith(MockitoExtension.class)
class UserAccountServiceTest {

    @Mock
    private UserStore userStore;

    @InjectMocks
    private UserAccountService userAccountService;

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void requireUserId_returnsContextUserId() {
        UserContext.set(42L, false, "session-abc");

        assertEquals(42L, userAccountService.requireUserId());
    }

    @Test
    void requireUserId_throwsUnauthorizedWhenNoSession() {
        UnauthorizedException ex = assertThrows(
                UnauthorizedException.class,
                userAccountService::requireUserId);
        assertEquals(UnauthorizedException.CODE, ex.getMessage());
    }
}
