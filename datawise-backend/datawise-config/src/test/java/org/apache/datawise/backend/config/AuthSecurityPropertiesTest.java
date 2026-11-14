package org.apache.datawise.backend.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AuthSecurityPropertiesTest {

    @Test
    void allowsBootstrapAuthAndHealthOnly() {
        AuthSecurityProperties props = new AuthSecurityProperties();
        assertTrue(props.isPublicPath("/api/health"));
        assertTrue(props.isPublicPath("/login"));
        assertTrue(props.isPublicPath("/login/guest"));
        assertTrue(props.isPublicPath("/signOut"));
        assertTrue(props.isPublicPath("/api/auth/login-options"));
        assertTrue(props.isPublicPath("/api/auth/register"));
        assertTrue(props.isPublicPath("/api/auth/oidc/login"));
        assertTrue(props.isPublicPath("/api/auth/oidc/callback"));
        assertTrue(props.isPublicPath("/api/public/shares/abc"));
        assertTrue(props.isPublicPath("/ws/ssh-shell"));
        assertTrue(props.isPublicPath("/ws/k8s-exec"));
        assertTrue(props.isPublicPath("/ws/terminal"));
        assertTrue(props.isPublicPath("/ws/community-plugin-stream"));
    }

    @Test
    void rejectsProtectedAuthAndApiPaths() {
        AuthSecurityProperties props = new AuthSecurityProperties();
        assertFalse(props.isPublicPath("/api/auth/session"));
        assertFalse(props.isPublicPath("/api/auth/oidc/config"));
        assertFalse(props.isPublicPath("/api/auth/change-password"));
        assertFalse(props.isPublicPath("/api/auth/session-policy"));
        assertFalse(props.isPublicPath("/api/auth/switch-tenant"));
        assertFalse(props.isPublicPath("/api/explorer/tree"));
        assertFalse(props.isPublicPath("/api/sql/execute"));
        assertFalse(props.isPublicPath("/api/system/metrics"));
        // Docs / metrics are not public in Java defaults (local yml may re-add swagger)
        assertFalse(
                props.isPublicPath("/actuator/prometheus"),
                () -> "unexpected public prefixes=" + props.getPublicPathPrefixes());
        assertFalse(props.isPublicPath("/v3/api-docs"));
        assertFalse(props.isPublicPath("/swagger-ui.html"));
        assertFalse(props.isPublicPath("/ws/other"));
        assertFalse(props.isPublicPath("/ws"));
    }

    @Test
    void allowsSameOriginSpaAssetsAndClientRoutes() {
        AuthSecurityProperties props = new AuthSecurityProperties();
        assertTrue(props.isPublicPath("/"));
        assertTrue(props.isPublicPath("/index.html"));
        assertTrue(props.isPublicPath("/assets/index-abc123.js"));
        assertTrue(props.isPublicPath("/favicon.ico"));
        assertTrue(props.isPublicPath("/sql"));
        assertTrue(props.isPublicPath("/settings/ai"));
        assertTrue(props.isPublicPath("/apple-touch-icon.png"));
    }

    @Test
    void doesNotMatchLongerSiblingPaths() {
        assertFalse(AuthSecurityProperties.matchesPublicPrefix("/api/healthz", "/api/health"));
        assertTrue(AuthSecurityProperties.matchesPublicPrefix("/api/health", "/api/health"));
        assertTrue(AuthSecurityProperties.matchesPublicPrefix("/login/guest", "/login"));
        assertFalse(AuthSecurityProperties.matchesPublicPrefix("/loginX", "/login"));
    }
}
