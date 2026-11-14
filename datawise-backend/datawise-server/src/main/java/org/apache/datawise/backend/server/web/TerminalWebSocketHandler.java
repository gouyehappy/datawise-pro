package org.apache.datawise.backend.server.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.backend.service.FeaturePermissionAccess;
import org.apache.datawise.backend.service.TeamService;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.terminal.TerminalPtySession;
import org.apache.datawise.backend.terminal.TerminalPtySessionManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class TerminalWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(TerminalWebSocketHandler.class);

    private final TerminalPtySessionManager sessionManager;
    private final TeamService teamService;
    private final FeaturePermissionAccess featurePermissionAccess;
    private final ObjectMapper objectMapper;
    private final Map<String, String> ptySessionBySocket = new ConcurrentHashMap<>();
    private final Map<String, Object> sendLocksBySocket = new ConcurrentHashMap<>();
    private final Map<String, TerminalWsOutputBridge> outputBridgeBySessionId = new ConcurrentHashMap<>();

    public TerminalWebSocketHandler(
            TerminalPtySessionManager sessionManager,
            TeamService teamService,
            FeaturePermissionAccess featurePermissionAccess,
            ObjectMapper objectMapper
    ) {
        this.sessionManager = sessionManager;
        this.teamService = teamService;
        this.featurePermissionAccess = featurePermissionAccess;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        JsonNode payload = objectMapper.readTree(message.getPayload());
        String type = payload.path("type").asText("");
        String sessionId = payload.path("sessionId").asText("");
        if (sessionId.isBlank()) {
            return;
        }

        switch (type) {
            case "create" -> handleCreate(session, sessionId, payload);
            case "write" -> handleWrite(session, sessionId, payload.path("data").asText(""));
            case "resize" -> handleResize(
                    session,
                    sessionId,
                    payload.path("cols").asInt(80),
                    payload.path("rows").asInt(24)
            );
            case "destroy" -> handleDestroy(session, sessionId);
            default -> log.debug("Ignoring unknown terminal WS message type: {}", type);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String sessionId = ptySessionBySocket.remove(session.getId());
        if (sessionId != null) {
            Long userId = userId(session);
            destroySession(session, sessionId, userId, "terminal.pty.disconnect");
        }
        sendLocksBySocket.remove(session.getId());
    }

    private void handleCreate(WebSocketSession socketSession, String sessionId, JsonNode payload) throws IOException {
        Long userId = userId(socketSession);
        int cols = payload.path("cols").asInt(80);
        int rows = payload.path("rows").asInt(24);
        try {
            // Defense in depth: handshake already checked; re-assert before PTY spawn.
            UserContext.set(userId, false, null);
            try {
                featurePermissionAccess.requireUtilTerminal();
            } finally {
                UserContext.clear();
            }
            TerminalPtySession ptySession = sessionManager.create(sessionId, userId, cols, rows);
            ptySessionBySocket.put(socketSession.getId(), sessionId);
            Object sendLock = sendLocksBySocket.computeIfAbsent(socketSession.getId(), ignored -> new Object());
            TerminalWsOutputBridge outputBridge = new TerminalWsOutputBridge(
                    socketSession,
                    objectMapper,
                    sessionId,
                    sendLock
            );
            closeOutputBridge(sessionId);
            outputBridgeBySessionId.put(sessionId, outputBridge);
            ptySession.pumpOutput(
                    outputBridge::accept,
                    code -> {
                        closeOutputBridge(sessionId);
                        send(socketSession, message("exit", sessionId).put("code", code));
                        destroySession(
                                socketSession,
                                sessionId,
                                userId,
                                "terminal.pty.exit",
                                "exitCode=" + code
                        );
                    }
            );
            teamService.recordTerminalAudit(
                    userId,
                    "terminal.pty.open",
                    "sessionId=" + sessionId + "; cols=" + cols + "; rows=" + rows
            );
            send(socketSession, message("created", sessionId).put("ok", true));
        } catch (Exception ex) {
            ExceptionLogging.warn(log, "terminal.pty.create sessionId=" + sessionId, ex);
            send(socketSession, message("created", sessionId).put("ok", false).put("error", ex.getMessage()));
        }
    }

    private void handleWrite(WebSocketSession socketSession, String sessionId, String data) throws IOException {
        if (!requireOwner(socketSession, sessionId)) {
            return;
        }
        TerminalPtySession ptySession = sessionManager.get(sessionId);
        if (ptySession == null) return;
        ptySession.write(data);
    }

    private void handleResize(WebSocketSession socketSession, String sessionId, int cols, int rows) {
        if (!requireOwner(socketSession, sessionId)) {
            return;
        }
        TerminalPtySession ptySession = sessionManager.get(sessionId);
        if (ptySession == null) return;
        ptySession.resize(cols, rows);
    }

    private void handleDestroy(WebSocketSession socketSession, String sessionId) {
        if (!requireOwner(socketSession, sessionId)) {
            return;
        }
        destroySession(socketSession, sessionId, userId(socketSession), "terminal.pty.close");
    }

    private void destroySession(WebSocketSession socketSession, String sessionId, Long userId, String action) {
        destroySession(socketSession, sessionId, userId, action, null);
    }

    private void destroySession(
            WebSocketSession socketSession,
            String sessionId,
            Long userId,
            String action,
            String extraDetail
    ) {
        closeOutputBridge(sessionId);
        sessionManager.destroy(sessionId);
        ptySessionBySocket.remove(socketSession.getId());
        String detail = "sessionId=" + sessionId;
        if (extraDetail != null && !extraDetail.isBlank()) {
            detail = detail + "; " + extraDetail;
        }
        teamService.recordTerminalAudit(userId, action, detail);
    }

    private void closeOutputBridge(String sessionId) {
        TerminalWsOutputBridge bridge = outputBridgeBySessionId.remove(sessionId);
        if (bridge != null) {
            bridge.close();
        }
    }

    private boolean requireOwner(WebSocketSession socketSession, String sessionId) {
        Long userId = userId(socketSession);
        if (sessionManager.isOwner(sessionId, userId)) {
            return true;
        }
        log.warn("Rejected terminal WS action for session {} by user {}", sessionId, userId);
        sendForbidden(socketSession, sessionId);
        return false;
    }

    private void sendForbidden(WebSocketSession socketSession, String sessionId) {
        send(socketSession, message("error", sessionId)
                .put("code", TerminalClientIpSupport.ERROR_CODE_FORBIDDEN)
                .put("message", "Terminal session access denied"));
    }

    private Long userId(WebSocketSession socketSession) {
        return (Long) socketSession.getAttributes().get(TerminalSessionHandshakeInterceptor.ATTR_USER_ID);
    }

    private ObjectNode message(String type, String sessionId) {
        return objectMapper.createObjectNode()
                .put("type", type)
                .put("sessionId", sessionId);
    }

    private void send(WebSocketSession session, ObjectNode node) {
        if (!session.isOpen()) return;
        String socketId = session.getId();
        if (socketId == null || socketId.isBlank()) {
            try {
                session.sendMessage(new TextMessage(objectMapper.writeValueAsString(node)));
            } catch (IOException ex) {
                log.debug("Failed to send terminal WS message", ex);
            }
            return;
        }
        Object lock = sendLocksBySocket.computeIfAbsent(socketId, ignored -> new Object());
        synchronized (lock) {
            if (!session.isOpen()) return;
            try {
                session.sendMessage(new TextMessage(objectMapper.writeValueAsString(node)));
            } catch (IOException ex) {
                log.debug("Failed to send terminal WS message", ex);
            }
        }
    }
}