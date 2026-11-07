package org.apache.datawise.backend.server.web;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CorsOriginAllowlistTest {

    @Test
    void defaultsAllowLoopbackAndAppScheme() {
        CorsOriginAllowlist allowlist = CorsOriginAllowlist.defaults();
        assertEquals("http://localhost:5173", allowlist.resolveAllowedOrigin("http://localhost:5173"));
        assertEquals("http://127.0.0.1:9090", allowlist.resolveAllowedOrigin("http://127.0.0.1:9090"));
        assertEquals("app://local", allowlist.resolveAllowedOrigin("app://local"));
        assertNull(allowlist.resolveAllowedOrigin("https://evil.example"));
    }

    @Test
    void emptyPatternsRejectAllCrossOrigin() {
        CorsOriginAllowlist allowlist = new CorsOriginAllowlist(List.of());
        assertTrue(allowlist.isEmpty());
        assertNull(allowlist.resolveAllowedOrigin("http://localhost:5173"));
    }
}
