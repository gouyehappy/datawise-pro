package org.apache.datawise.backend.server.web;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PasswordChangeRequiredFilterTest {

    @Test
    void allowsPasswordChangeSessionAndSignOutOnly() {
        assertTrue(PasswordChangeRequiredFilter.isAllowedWhilePasswordChangeRequired(
                "/api/auth/change-password", "POST"));
        assertTrue(PasswordChangeRequiredFilter.isAllowedWhilePasswordChangeRequired(
                "/api/auth/session", "GET"));
        assertTrue(PasswordChangeRequiredFilter.isAllowedWhilePasswordChangeRequired(
                "/signOut", "POST"));
        assertTrue(PasswordChangeRequiredFilter.isAllowedWhilePasswordChangeRequired(
                "/api/health", "GET"));
        assertFalse(PasswordChangeRequiredFilter.isAllowedWhilePasswordChangeRequired(
                "/api/explorer/tree", "GET"));
        assertFalse(PasswordChangeRequiredFilter.isAllowedWhilePasswordChangeRequired(
                "/api/auth/change-password", "GET"));
    }
}
