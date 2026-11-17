package org.apache.datawise.desktop.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;

class DesktopRendererTrustTest {
    @Test
    void acceptsLoopbackHttpAndHttps() {
        assertTrue(DesktopRendererTrust.isTrustedRendererUrl("http://127.0.0.1:28413/"));
        assertTrue(DesktopRendererTrust.isTrustedRendererUrl("http://localhost:5173/app"));
        assertTrue(DesktopRendererTrust.isTrustedRendererUrl("https://127.0.0.1/"));
        assertTrue(DesktopRendererTrust.isTrustedRendererUrl("https://localhost"));
    }

    @Test
    void rejectsNonLoopbackAndNonHttp() {
        assertFalse(DesktopRendererTrust.isTrustedRendererUrl(null));
        assertFalse(DesktopRendererTrust.isTrustedRendererUrl(""));
        assertFalse(DesktopRendererTrust.isTrustedRendererUrl("about:blank"));
        assertFalse(DesktopRendererTrust.isTrustedRendererUrl("file:///C:/index.html"));
        assertFalse(DesktopRendererTrust.isTrustedRendererUrl("http://evil.example/"));
        assertFalse(DesktopRendererTrust.isTrustedRendererUrl("http://192.168.1.1/"));
        assertFalse(DesktopRendererTrust.isTrustedRendererUrl("http://[::1]/"));
    }

    @Test
    void sanitizeOverrideKeepsTrustedOnly() {
        assertEquals("http://127.0.0.1:28413/",
                DesktopRendererTrust.sanitizeRendererUrlOverride(" http://127.0.0.1:28413/ "));
        assertNull(DesktopRendererTrust.sanitizeRendererUrlOverride("https://evil.example/"));
        assertNull(DesktopRendererTrust.sanitizeRendererUrlOverride(null));
    }
}
