package org.apache.datawise.backend.controller.auth;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AuthControllerOidcRedirectTest {

    @Test
    void appendFragment_putsSessionInHashNotQuery() {
        String redirect = AuthController.appendFragment("http://localhost:28413/", "oidcSession", "sess-abc");
        redirect = AuthController.appendFragment(redirect, "oidcUser", "alice");
        assertTrue(redirect.startsWith("http://localhost:28413/#"));
        assertTrue(redirect.contains("oidcSession=sess-abc"));
        assertTrue(redirect.contains("oidcUser=alice"));
        assertFalse(redirect.contains("?oidcSession="));
        assertFalse(redirect.contains("&oidcSession="));
    }

    @Test
    void appendFragment_preservesExistingQuery() {
        String redirect = AuthController.appendFragment(
                "http://localhost:28413/app?lang=zh",
                "oidcSession",
                "s1");
        assertEquals("http://localhost:28413/app?lang=zh#oidcSession=s1", redirect);
    }

    @Test
    void appendFragment_encodesSpecialCharacters() {
        String redirect = AuthController.appendFragment(
                "http://localhost:28413/",
                "oidcError",
                "bad value&x=1");
        assertTrue(redirect.contains("oidcError=bad+value%26x%3D1")
                || redirect.contains("oidcError=bad%20value%26x%3D1"));
    }
}
