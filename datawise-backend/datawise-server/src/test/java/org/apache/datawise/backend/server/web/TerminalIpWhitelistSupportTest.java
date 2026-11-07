package org.apache.datawise.backend.server.web;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TerminalIpWhitelistSupportTest {

    @Test
    void emptyWhitelistAllowsAll() {
        assertTrue(TerminalIpWhitelistSupport.isAllowed("203.0.113.1", List.of()));
        assertTrue(TerminalIpWhitelistSupport.isAllowed(null, null));
    }

    @Test
    void exactMatch() {
        List<String> allowed = List.of("127.0.0.1", "10.0.0.5");
        assertTrue(TerminalIpWhitelistSupport.isAllowed("127.0.0.1", allowed));
        assertTrue(TerminalIpWhitelistSupport.isAllowed("10.0.0.5", allowed));
        assertFalse(TerminalIpWhitelistSupport.isAllowed("10.0.0.6", allowed));
    }

    @Test
    void cidrMatch() {
        List<String> allowed = List.of("10.0.0.0/8");
        assertTrue(TerminalIpWhitelistSupport.isAllowed("10.1.2.3", allowed));
        assertFalse(TerminalIpWhitelistSupport.isAllowed("192.168.1.1", allowed));
    }
}
