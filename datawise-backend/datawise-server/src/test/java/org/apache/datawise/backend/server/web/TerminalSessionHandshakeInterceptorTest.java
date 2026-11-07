package org.apache.datawise.backend.server.web;

import org.apache.datawise.backend.configstore.SessionStore;
import org.apache.datawise.backend.model.SessionEntity;
import org.apache.datawise.backend.service.TeamService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.socket.WebSocketHandler;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TerminalSessionHandshakeInterceptorTest {

    @Mock
    private SessionStore sessionStore;
    @Mock
    private TeamService teamService;
    @Mock
    private WebSocketHandler webSocketHandler;
    @Mock
    private ServerHttpResponse response;

    @Test
    void allowsRegisteredUserFromWhitelistedIp() {
        TerminalWebSocketProperties properties = new TerminalWebSocketProperties();
        properties.setAllowedIps(java.util.List.of("127.0.0.1"));
        TerminalSessionHandshakeInterceptor interceptor =
                new TerminalSessionHandshakeInterceptor(sessionStore, properties, teamService);

        SessionEntity session = new SessionEntity();
        session.setUserId(9L);
        session.setGuest(false);
        when(sessionStore.authenticate("sess-1")).thenReturn(Optional.of(session));

        Map<String, Object> attributes = new HashMap<>();
        ServerHttpRequest request = servletRequest("sess-1", "127.0.0.1");

        assertTrue(interceptor.beforeHandshake(request, response, webSocketHandler, attributes));
        assertEquals(9L, attributes.get(TerminalSessionHandshakeInterceptor.ATTR_USER_ID));
        verifyNoInteractions(teamService);
    }

    @Test
    void rejectsIpOutsideWhitelistAndAudits() {
        TerminalWebSocketProperties properties = new TerminalWebSocketProperties();
        properties.setAllowedIps(java.util.List.of("10.0.0.0/8"));
        TerminalSessionHandshakeInterceptor interceptor =
                new TerminalSessionHandshakeInterceptor(sessionStore, properties, teamService);

        SessionEntity session = new SessionEntity();
        session.setUserId(4L);
        session.setGuest(false);
        when(sessionStore.authenticate("sess-2")).thenReturn(Optional.of(session));

        Map<String, Object> attributes = new HashMap<>();
        ServerHttpRequest request = servletRequest("sess-2", "203.0.113.8");

        assertFalse(interceptor.beforeHandshake(request, response, webSocketHandler, attributes));
        verify(teamService).recordTerminalAudit(
                eq(4L),
                eq("terminal.pty.denied"),
                eq("reason=ip-not-allowed; clientIp=203.0.113.8")
        );
    }

    @Test
    void rejectsSpoofedForwardedHeaderWithoutTrustedProxy() {
        TerminalWebSocketProperties properties = new TerminalWebSocketProperties();
        properties.setAllowedIps(java.util.List.of("10.0.0.0/8"));
        TerminalSessionHandshakeInterceptor interceptor =
                new TerminalSessionHandshakeInterceptor(sessionStore, properties, teamService);

        SessionEntity session = new SessionEntity();
        session.setUserId(4L);
        session.setGuest(false);
        when(sessionStore.authenticate("sess-3")).thenReturn(Optional.of(session));

        MockHttpServletRequest servlet = new MockHttpServletRequest();
        servlet.setQueryString("dwSession=sess-3");
        servlet.setRemoteAddr("203.0.113.8");
        servlet.addHeader("X-Forwarded-For", "10.0.0.5");
        ServerHttpRequest request = new ServletServerHttpRequest(servlet);

        Map<String, Object> attributes = new HashMap<>();
        assertFalse(interceptor.beforeHandshake(request, response, webSocketHandler, attributes));
        verify(teamService).recordTerminalAudit(
                eq(4L),
                eq("terminal.pty.denied"),
                eq("reason=ip-not-allowed; clientIp=203.0.113.8")
        );
    }

    @Test
    void allowsClientIpFromForwardedHeaderWhenProxyTrusted() {
        TerminalWebSocketProperties properties = new TerminalWebSocketProperties();
        properties.setAllowedIps(java.util.List.of("10.0.0.0/8"));
        properties.setTrustedProxyIps(java.util.List.of("127.0.0.1"));
        TerminalSessionHandshakeInterceptor interceptor =
                new TerminalSessionHandshakeInterceptor(sessionStore, properties, teamService);

        SessionEntity session = new SessionEntity();
        session.setUserId(11L);
        session.setGuest(false);
        when(sessionStore.authenticate("sess-4")).thenReturn(Optional.of(session));

        MockHttpServletRequest servlet = new MockHttpServletRequest();
        servlet.setQueryString("dwSession=sess-4");
        servlet.setRemoteAddr("127.0.0.1");
        servlet.addHeader("X-Forwarded-For", "10.0.0.5");
        ServerHttpRequest request = new ServletServerHttpRequest(servlet);

        Map<String, Object> attributes = new HashMap<>();
        assertTrue(interceptor.beforeHandshake(request, response, webSocketHandler, attributes));
        assertEquals(11L, attributes.get(TerminalSessionHandshakeInterceptor.ATTR_USER_ID));
        verifyNoInteractions(teamService);
    }

    @Test
    void rejectsGuestSessionForLocalPty() {
        TerminalWebSocketProperties properties = new TerminalWebSocketProperties();
        TerminalSessionHandshakeInterceptor interceptor =
                new TerminalSessionHandshakeInterceptor(sessionStore, properties, teamService);

        SessionEntity session = new SessionEntity();
        session.setUserId(2L);
        session.setGuest(true);
        when(sessionStore.authenticate("guest-sess")).thenReturn(Optional.of(session));

        Map<String, Object> attributes = new HashMap<>();
        ServerHttpRequest request = servletRequest("guest-sess", "127.0.0.1");

        assertFalse(interceptor.beforeHandshake(request, response, webSocketHandler, attributes));
        verifyNoInteractions(teamService);
    }

    private static ServerHttpRequest servletRequest(String sessionId, String remoteAddr) {
        MockHttpServletRequest servlet = new MockHttpServletRequest();
        servlet.setQueryString("dwSession=" + sessionId);
        servlet.setRemoteAddr(remoteAddr);
        return new ServletServerHttpRequest(servlet);
    }
}
