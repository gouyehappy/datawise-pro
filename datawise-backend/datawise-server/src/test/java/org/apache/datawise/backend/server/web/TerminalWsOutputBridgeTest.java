package org.apache.datawise.backend.server.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TerminalWsOutputBridgeTest {

    @Mock
    private WebSocketSession webSocketSession;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private final Object sendLock = new Object();

    @AfterEach
    void tearDown() {
        scheduler.shutdownNow();
    }

    @Test
    void flushSendsBase64EncodedBytes() throws Exception {
        when(webSocketSession.isOpen()).thenReturn(true);
        TerminalWsOutputBridge bridge = new TerminalWsOutputBridge(
                webSocketSession,
                objectMapper,
                "sess-1",
                sendLock,
                scheduler
        );

        byte[] utf8 = "你好".getBytes(StandardCharsets.UTF_8);
        // Split multi-byte sequence across accepts — must survive as raw bytes.
        bridge.accept(new byte[]{utf8[0]});
        bridge.accept(java.util.Arrays.copyOfRange(utf8, 1, utf8.length));
        bridge.flush();

        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        verify(webSocketSession, atLeastOnce()).sendMessage(captor.capture());
        ObjectNode node = (ObjectNode) objectMapper.readTree(captor.getValue().getPayload());
        assertEquals("output", node.path("type").asText());
        assertEquals("base64", node.path("encoding").asText());
        assertEquals("sess-1", node.path("sessionId").asText());
        byte[] decoded = Base64.getDecoder().decode(node.path("data").asText());
        assertEquals("你好", new String(decoded, StandardCharsets.UTF_8));
    }

    @Test
    void closeFlushesRemainingBytes() throws Exception {
        when(webSocketSession.isOpen()).thenReturn(true);
        TerminalWsOutputBridge bridge = new TerminalWsOutputBridge(
                webSocketSession,
                objectMapper,
                "sess-2",
                sendLock,
                scheduler
        );
        bridge.accept("hi".getBytes(StandardCharsets.UTF_8));
        bridge.close();

        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        verify(webSocketSession).sendMessage(captor.capture());
        ObjectNode node = (ObjectNode) objectMapper.readTree(captor.getValue().getPayload());
        assertEquals("base64", node.path("encoding").asText());
        assertEquals(
                "hi",
                new String(Base64.getDecoder().decode(node.path("data").asText()), StandardCharsets.UTF_8)
        );
    }

    @Test
    void truncatesOversizedIncomingChunkAndKeepsTail() throws Exception {
        when(webSocketSession.isOpen()).thenReturn(true);
        TerminalWsOutputBridge bridge = new TerminalWsOutputBridge(
                webSocketSession,
                objectMapper,
                "sess-flood",
                sendLock,
                scheduler
        );
        byte[] huge = new byte[TerminalWsOutputBridge.MAX_BUFFER_BYTES + 80_000];
        huge[huge.length - 1] = 42;
        bridge.accept(huge);
        org.junit.jupiter.api.Assertions.assertTrue(
                bridge.droppedBytes() >= 80_000,
                "expected oversized chunk to drop leading bytes"
        );
        bridge.flush();

        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        verify(webSocketSession, atLeastOnce()).sendMessage(captor.capture());
        ObjectNode node = (ObjectNode) objectMapper.readTree(captor.getValue().getPayload());
        byte[] decoded = Base64.getDecoder().decode(node.path("data").asText());
        assertEquals(42, decoded[decoded.length - 1]);
        bridge.close();
    }
}
