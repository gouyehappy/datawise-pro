package org.apache.datawise.backend.server.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.backend.service.TeamService;
import org.apache.datawise.backend.terminal.TerminalPtySessionManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TerminalWebSocketHandlerTest {

    @Mock
    private TerminalPtySessionManager sessionManager;
    @Mock
    private TeamService teamService;
    @Mock
    private WebSocketSession webSocketSession;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void writeRejectsNonOwnerWithForbiddenError() throws Exception {
        TerminalWebSocketHandler handler = new TerminalWebSocketHandler(sessionManager, teamService, objectMapper);
        when(webSocketSession.getAttributes()).thenReturn(Map.of(TerminalSessionHandshakeInterceptor.ATTR_USER_ID, 2L));
        when(webSocketSession.isOpen()).thenReturn(true);
        when(sessionManager.isOwner("pty-1", 2L)).thenReturn(false);

        String payload = objectMapper.writeValueAsString(Map.of(
                "type", "write",
                "sessionId", "pty-1",
                "data", "ls\n"
        ));
        handler.handleTextMessage(webSocketSession, new TextMessage(payload));

        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        verify(webSocketSession).sendMessage(captor.capture());
        ObjectNode response = (ObjectNode) objectMapper.readTree(captor.getValue().getPayload());
        assertEquals("error", response.path("type").asText());
        assertEquals(TerminalClientIpSupport.ERROR_CODE_FORBIDDEN, response.path("code").asText());
        assertEquals("pty-1", response.path("sessionId").asText());
        verify(sessionManager, never()).get(any());
    }

    @Test
    void writeAllowsOwner() throws Exception {
        TerminalWebSocketHandler handler = new TerminalWebSocketHandler(sessionManager, teamService, objectMapper);
        when(webSocketSession.getAttributes()).thenReturn(Map.of(TerminalSessionHandshakeInterceptor.ATTR_USER_ID, 2L));
        when(sessionManager.isOwner("pty-1", 2L)).thenReturn(true);
        when(sessionManager.get("pty-1")).thenReturn(null);

        String payload = objectMapper.writeValueAsString(Map.of(
                "type", "write",
                "sessionId", "pty-1",
                "data", "ls\n"
        ));
        handler.handleTextMessage(webSocketSession, new TextMessage(payload));

        verify(webSocketSession, never()).sendMessage(any());
        verify(sessionManager).get("pty-1");
    }
}
