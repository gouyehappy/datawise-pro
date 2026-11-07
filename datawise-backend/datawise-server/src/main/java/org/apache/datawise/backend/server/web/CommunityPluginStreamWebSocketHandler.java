package org.apache.datawise.backend.server.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;
import org.apache.datawise.backend.server.communityplugin.CommunityPluginHost;
import org.apache.datawise.backend.server.communityplugin.CommunityPluginSidecarSession;
import org.apache.datawise.backend.server.communityplugin.PluginFramedCodec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

/**
 * Relays sidecar framed binary + JSON-RPC events to the workbench over WebSocket.
 *
 * <p>Wire (browser ↔ host):
 * <ul>
 *   <li>Binary: DBX binary payload ({@code u16 channelLen + channel + data})</li>
 *   <li>Text: {@code {"type":"event","method":"...","params":...}}</li>
 * </ul>
 *
 * <p>Terminal output is <strong>not</strong> coalesced here: the SSH sidecar already
 * merges PTY bursts before assigning sequence numbers. A second host-side timer
 * only stacked latency, and dropping buffered frames under backpressure would
 * punch holes in the monotone sequence the workbench drain depends on.
 */
@Component
public class CommunityPluginStreamWebSocketHandler extends AbstractWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(CommunityPluginStreamWebSocketHandler.class);

    private final CommunityPluginHost host;
    private final ObjectMapper objectMapper;
    private final Map<String, Binding> bindings = new ConcurrentHashMap<>();

    public CommunityPluginStreamWebSocketHandler(CommunityPluginHost host, ObjectMapper objectMapper) {
        this.host = host;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        String pluginId = (String) session.getAttributes().get(CommunityPluginStreamHandshakeInterceptor.ATTR_PLUGIN_ID);
        if (pluginId == null || pluginId.isBlank()) {
            closeQuietly(session, CloseStatus.BAD_DATA);
            return;
        }
        final CommunityPluginSidecarSession sidecar;
        try {
            // host.events OR host.binary: jsonl plugins get the events channel,
            // framed plugins additionally get binary frames.
            host.requireStreamAccess(pluginId);
            sidecar = host.requireActive(pluginId);
        } catch (CommunityPluginException e) {
            log.warn("Community plugin stream denied pluginId={}: {}", pluginId, e.getMessage());
            closeQuietly(session, CloseStatus.POLICY_VIOLATION);
            return;
        }
        Consumer<com.fasterxml.jackson.databind.JsonNode> eventListener = message -> {
            try {
                ObjectNode envelope = objectMapper.createObjectNode();
                envelope.put("type", "event");
                envelope.put("method", message.path("method").asText());
                if (message.has("params")) {
                    envelope.set("params", message.get("params"));
                }
                synchronized (session) {
                    if (session.isOpen()) {
                        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(envelope)));
                    }
                }
            } catch (Exception ex) {
                log.debug("Failed to forward plugin event: {}", ex.getMessage());
            }
        };
        BiConsumer<String, byte[]> binaryListener = (channel, data) -> {
            try {
                byte[] payload = encodeBinaryPayload(channel, data);
                synchronized (session) {
                    if (session.isOpen()) {
                        session.sendMessage(new BinaryMessage(ByteBuffer.wrap(payload)));
                    }
                }
            } catch (Exception ex) {
                log.debug("Failed to forward plugin binary: {}", ex.getMessage());
            }
        };
        sidecar.addEventListener(eventListener);
        sidecar.addBinaryListener(binaryListener);
        bindings.put(session.getId(), new Binding(pluginId, sidecar, eventListener, binaryListener));
        try {
            ObjectNode ready = objectMapper.createObjectNode();
            ready.put("type", "ready");
            ready.put("pluginId", pluginId);
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(ready)));
        } catch (IOException e) {
            log.debug("Failed to send stream ready: {}", e.getMessage());
        }
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) {
        Binding binding = bindings.get(session.getId());
        if (binding == null) {
            return;
        }
        try {
            ByteBuffer buf = message.getPayload();
            byte[] payload = new byte[buf.remaining()];
            buf.get(payload);
            PluginFramedCodec.BinaryFrame binary = decodeBinaryPayload(payload);
            binding.sidecar().sendBinary(binary.channel(), binary.data());
        } catch (Exception e) {
            log.debug("Failed to handle plugin binary WS message: {}", e.getMessage());
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        if ("ping".equalsIgnoreCase(message.getPayload())) {
            try {
                session.sendMessage(new TextMessage("{\"type\":\"pong\"}"));
            } catch (IOException ignored) {
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        Binding binding = bindings.remove(session.getId());
        if (binding != null) {
            binding.sidecar().removeEventListener(binding.eventListener());
            binding.sidecar().removeBinaryListener(binding.binaryListener());
        }
    }

    static byte[] encodeBinaryPayload(String channel, byte[] data) throws IOException {
        ByteArrayOutputStream framed = new ByteArrayOutputStream();
        PluginFramedCodec.writeBinary(framed, channel, data);
        byte[] full = framed.toByteArray();
        return Arrays.copyOfRange(full, 5, full.length);
    }

    static PluginFramedCodec.BinaryFrame decodeBinaryPayload(byte[] payload) throws IOException {
        ByteArrayOutputStream wrap = new ByteArrayOutputStream();
        wrap.write(PluginFramedCodec.KIND_BINARY);
        int len = payload.length;
        wrap.write((len >>> 24) & 0xFF);
        wrap.write((len >>> 16) & 0xFF);
        wrap.write((len >>> 8) & 0xFF);
        wrap.write(len & 0xFF);
        wrap.write(payload);
        PluginFramedCodec.Frame frame = PluginFramedCodec.readFrame(new ByteArrayInputStream(wrap.toByteArray()));
        if (!(frame instanceof PluginFramedCodec.BinaryFrame binary)) {
            throw new CommunityPluginException("Expected binary frame payload");
        }
        return binary;
    }

    private static void closeQuietly(WebSocketSession session, CloseStatus status) {
        try {
            session.close(status);
        } catch (IOException ignored) {
        }
    }

    private record Binding(
            String pluginId,
            CommunityPluginSidecarSession sidecar,
            Consumer<com.fasterxml.jackson.databind.JsonNode> eventListener,
            BiConsumer<String, byte[]> binaryListener
    ) {
    }
}
