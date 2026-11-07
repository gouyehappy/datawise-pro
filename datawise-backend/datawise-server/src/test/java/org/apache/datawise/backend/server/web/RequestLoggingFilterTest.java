package org.apache.datawise.backend.server.web;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RequestLoggingFilterTest {

    @Test
    void quietPathsSkipHealthAndActuator() {
        assertTrue(RequestLoggingFilter.isQuietPath("/api/health"));
        assertTrue(RequestLoggingFilter.isQuietPath("/api/health?ts=1"));
        assertTrue(RequestLoggingFilter.isQuietPath("/favicon.ico"));
        assertTrue(RequestLoggingFilter.isQuietPath("/actuator/health"));
        assertFalse(RequestLoggingFilter.isQuietPath("/api/platform/outbound-webhooks"));
        assertFalse(RequestLoggingFilter.isQuietPath(null));
    }

    @Test
    void fastReadsStayDebug_writesAndFailuresStayVisible() {
        assertEquals(RequestLoggingFilter.AccessSeverity.SKIP,
                RequestLoggingFilter.classify("OPTIONS", 200, 1));
        assertEquals(RequestLoggingFilter.AccessSeverity.DEBUG,
                RequestLoggingFilter.classify("GET", 200, 3));
        assertEquals(RequestLoggingFilter.AccessSeverity.INFO,
                RequestLoggingFilter.classify("POST", 200, 5));
        assertEquals(RequestLoggingFilter.AccessSeverity.WARN,
                RequestLoggingFilter.classify("GET", 200, RequestLoggingFilter.SLOW_MS));
        assertEquals(RequestLoggingFilter.AccessSeverity.WARN,
                RequestLoggingFilter.classify("GET", 401, 2));
        assertEquals(RequestLoggingFilter.AccessSeverity.ERROR,
                RequestLoggingFilter.classify("GET", 500, 2));
    }

    @Test
    void accessLineIsShortAndDoesNotRepeatTheFullSession() {
        String line = RequestLoggingFilter.formatAccessLine(
                "get",
                "/api/explorer/tree?refresh=true",
                200,
                1204,
                "session-52eb318a5fa8fd8fd6e70cb264671a9181a671323d9d999b83ff58f6e712c364",
                RequestLoggingFilter.AccessSeverity.WARN
        );
        assertEquals("GET /api/explorer/tree?refresh=true 200 1204ms slow sid=52eb318a", line);

        String read = RequestLoggingFilter.formatAccessLine(
                "GET",
                "/api/notifications",
                200,
                1,
                "session-52eb318a5fa8fd8f",
                RequestLoggingFilter.AccessSeverity.DEBUG
        );
        assertEquals("GET /api/notifications 200 1ms", read);
    }
}
