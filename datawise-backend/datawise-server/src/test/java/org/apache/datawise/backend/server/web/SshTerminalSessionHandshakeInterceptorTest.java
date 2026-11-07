package org.apache.datawise.backend.server.web;

import org.apache.datawise.backend.configstore.SessionStore;
import org.apache.datawise.backend.model.SessionEntity;
import org.apache.datawise.backend.service.TeamService;
import org.junit.jupiter.api.Test;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.socket.WebSocketHandler;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SshTerminalSessionHandshakeInterceptorTest {

    @Test
    void rejectsMissingSessionOrConnection() {
        SessionStore sessionStore = mock(SessionStore.class);
        TeamService teamService = mock(TeamService.class);
        SshTerminalWebSocketProperties props = new SshTerminalWebSocketProperties();
        SshTerminalSessionHandshakeInterceptor interceptor =
                new SshTerminalSessionHandshakeInterceptor(sessionStore, props, teamService);

        assertFalse(handshake(interceptor, null, "conn-1"));
        assertFalse(handshake(interceptor, "sess-1", null));
        verify(sessionStore, never()).authenticate(anyString());
    }

    @Test
    void rejectsGuestSessions() {
        SessionStore sessionStore = mock(SessionStore.class);
        TeamService teamService = mock(TeamService.class);
        SessionEntity guest = mock(SessionEntity.class);
        when(guest.isGuest()).thenReturn(true);
        when(sessionStore.authenticate("sess-guest")).thenReturn(Optional.of(guest));

        SshTerminalSessionHandshakeInterceptor interceptor =
                new SshTerminalSessionHandshakeInterceptor(
                        sessionStore, new SshTerminalWebSocketProperties(), teamService);

        assertFalse(handshake(interceptor, "sess-guest", "conn-1"));
    }

    @Test
    void acceptsRegisteredSessionAndStoresAttributes() {
        SessionStore sessionStore = mock(SessionStore.class);
        TeamService teamService = mock(TeamService.class);
        SessionEntity session = mock(SessionEntity.class);
        when(session.isGuest()).thenReturn(false);
        when(session.getUserId()).thenReturn(42L);
        when(sessionStore.authenticate("sess-ok")).thenReturn(Optional.of(session));

        SshTerminalSessionHandshakeInterceptor interceptor =
                new SshTerminalSessionHandshakeInterceptor(
                        sessionStore, new SshTerminalWebSocketProperties(), teamService);

        Map<String, Object> attributes = new HashMap<>();
        assertTrue(handshake(interceptor, "sess-ok", "conn-9", attributes));
        assertEquals(42L, attributes.get(SshTerminalSessionHandshakeInterceptor.ATTR_USER_ID));
        assertEquals("conn-9", attributes.get(SshTerminalSessionHandshakeInterceptor.ATTR_CONNECTION_ID));
    }

    private static boolean handshake(
            SshTerminalSessionHandshakeInterceptor interceptor,
            String dwSession,
            String connectionId
    ) {
        return handshake(interceptor, dwSession, connectionId, new HashMap<>());
    }

    private static boolean handshake(
            SshTerminalSessionHandshakeInterceptor interceptor,
            String dwSession,
            String connectionId,
            Map<String, Object> attributes
    ) {
        MockHttpServletRequest servletRequest = new MockHttpServletRequest("GET", "/ws/ssh-shell");
        StringBuilder query = new StringBuilder();
        if (dwSession != null) {
            query.append("dwSession=").append(dwSession);
        }
        if (connectionId != null) {
            if (query.length() > 0) {
                query.append('&');
            }
            query.append("connectionId=").append(connectionId);
        }
        servletRequest.setQueryString(query.length() > 0 ? query.toString() : null);
        ServletServerHttpRequest request = new ServletServerHttpRequest(servletRequest);
        ServletServerHttpResponse response = new ServletServerHttpResponse(new MockHttpServletResponse());
        return interceptor.beforeHandshake(request, response, mock(WebSocketHandler.class), attributes);
    }
}
