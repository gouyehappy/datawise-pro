package org.apache.datawise.backend.server.web;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TerminalClientIpSupportTest {

    @Test
    void resolveClientIp_ignoresForwardedHeaderWithoutTrustedProxy() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Forwarded-For", "203.0.113.10, 10.0.0.5");
        request.setRemoteAddr("127.0.0.1");

        assertEquals("127.0.0.1", TerminalClientIpSupport.resolveClientIp(request, List.of()));
    }

    @Test
    void resolveClientIp_prefersForwardedHeaderFromTrustedProxy() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Forwarded-For", "203.0.113.10, 10.0.0.5");
        request.setRemoteAddr("127.0.0.1");

        assertEquals(
                "203.0.113.10",
                TerminalClientIpSupport.resolveClientIp(request, List.of("127.0.0.1"))
        );
    }

    @Test
    void resolveClientIp_fallsBackToRemoteAddr() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("192.168.1.20");

        assertEquals("192.168.1.20", TerminalClientIpSupport.resolveClientIp(request, List.of()));
    }

    @Test
    void shouldTrustForwardedHeaders_requiresNonEmptyTrustedList() {
        assertFalse(TerminalClientIpSupport.shouldTrustForwardedHeaders("127.0.0.1", List.of()));
        assertTrue(TerminalClientIpSupport.shouldTrustForwardedHeaders("127.0.0.1", List.of("127.0.0.1")));
        assertTrue(TerminalClientIpSupport.shouldTrustForwardedHeaders("10.0.0.1", List.of("10.0.0.0/8")));
    }

    @Test
    void normalizeHost_stripsIpv4MappedPrefix() {
        assertEquals("127.0.0.1", TerminalClientIpSupport.normalizeHost("::ffff:127.0.0.1"));
        assertEquals("::1", TerminalClientIpSupport.normalizeHost("0:0:0:0:0:0:0:1"));
        assertNull(TerminalClientIpSupport.normalizeHost("  "));
    }
}
