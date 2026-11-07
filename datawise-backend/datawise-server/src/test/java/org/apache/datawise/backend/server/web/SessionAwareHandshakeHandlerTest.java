package org.apache.datawise.backend.server.web;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketHandler;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;

class SessionAwareHandshakeHandlerTest {

    @Test
    void acceptsDynamicSessionSubProtocols() {
        SessionAwareHandshakeHandler handler = new SessionAwareHandshakeHandler();
        WebSocketHandler ws = mock(WebSocketHandler.class);
        String selected = handler.selectProtocol(
                List.of("session-abc123def456"),
                ws
        );
        assertEquals("session-abc123def456", selected);
    }

    @Test
    void rejectsNonSessionProtocolsWhenUnsupported() {
        SessionAwareHandshakeHandler handler = new SessionAwareHandshakeHandler();
        WebSocketHandler ws = mock(WebSocketHandler.class);
        assertNull(handler.selectProtocol(List.of("chat.v1"), ws));
    }
}
