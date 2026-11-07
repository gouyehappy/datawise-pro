package org.apache.datawise.backend.server.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.kubernetes.exec.KubernetesExecSession;
import org.apache.datawise.backend.kubernetes.exec.KubernetesExecSessionManager;
import org.apache.datawise.backend.service.TeamService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class K8sExecWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(K8sExecWebSocketHandler.class);
    private static final AtomicInteger CREATE_THREAD_SEQ = new AtomicInteger();
    /** Cap concurrent Kubernetes exec creates (was unbounded cached pool). */
    private static final int CREATE_POOL_SIZE = Math.max(4, Math.min(32, Runtime.getRuntime().availableProcessors() * 2));

    private final KubernetesExecSessionManager sessionManager;
    private final ConnectionExecutionContext connectionContext;
    private final TeamService teamService;
    private final ObjectMapper objectMapper;
    private final Map<String, String> execSessionBySocket = new ConcurrentHashMap<>();
    private final Map<String, String> pendingSessionBySocket = new ConcurrentHashMap<>();
    private final Map<String, Object> sendLocksBySocket = new ConcurrentHashMap<>();
    private final Map<String, TerminalWsOutputBridge> outputBridgeBySessionId = new ConcurrentHashMap<>();
    private final ExecutorService execCreateExecutor = Executors.newFixedThreadPool(
            CREATE_POOL_SIZE,
            r -> {
                Thread thread = new Thread(r, "k8s-exec-create-" + CREATE_THREAD_SEQ.incrementAndGet());
                thread.setDaemon(true);
                return thread;
            }
    );

    public K8sExecWebSocketHandler(
            KubernetesExecSessionManager sessionManager,
            ConnectionExecutionContext connectionContext,
            TeamService teamService,
            ObjectMapper objectMapper
    ) {
        this.sessionManager = sessionManager;
        this.connectionContext = connectionContext;
        this.teamService = teamService;
        this.objectMapper = objectMapper;
    }

    @PreDestroy
    void shutdownExecCreateExecutor() {
        execCreateExecutor.shutdownNow();
        try {
            if (!execCreateExecutor.awaitTermination(3, TimeUnit.SECONDS)) {
                log.debug("Kubernetes exec create executor did not terminate within 3s");
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
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
            case "ping" -> handlePing(session, sessionId);
            case "destroy" -> handleDestroy(session, sessionId);
            default -> log.debug("Ignoring unknown k8s exec WS message type: {}", type);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String socketId = session.getId();
        String pendingSessionId = pendingSessionBySocket.remove(socketId);
        String activeSessionId = execSessionBySocket.remove(socketId);
        Long userId = userId(session);
        if (pendingSessionId != null) {
            destroySession(session, pendingSessionId, userId, "k8s.exec.disconnect", "pending");
        }
        if (activeSessionId != null && !activeSessionId.equals(pendingSessionId)) {
            destroySession(session, activeSessionId, userId, "k8s.exec.disconnect", null);
        }
        sendLocksBySocket.remove(socketId);
    }

    private void handleCreate(WebSocketSession socketSession, String sessionId, JsonNode payload) {
        Long userId = userId(socketSession);
        String connectionId = connectionId(socketSession);
        String namespace = payload.path("namespace").asText("");
        String podName = payload.path("podName").asText("");
        String container = payload.path("container").asText("");
        int cols = payload.path("cols").asInt(80);
        int rows = payload.path("rows").asInt(24);
        List<String> command = readCommand(payload.path("command"));
        if (userId == null || connectionId == null || connectionId.isBlank()) {
            send(socketSession, message("created", sessionId)
                    .put("ok", false)
                    .put("error", "Kubernetes exec session is not authenticated"));
            return;
        }
        if (namespace.isBlank() || podName.isBlank()) {
            send(socketSession, message("created", sessionId)
                    .put("ok", false)
                    .put("error", "namespace and podName are required"));
            return;
        }
        pendingSessionBySocket.put(socketSession.getId(), sessionId);
        try {
            execCreateExecutor.execute(() -> openExecSession(
                    socketSession,
                    sessionId,
                    userId,
                    connectionId,
                    namespace,
                    podName,
                    container,
                    cols,
                    rows,
                    command
            ));
        } catch (RejectedExecutionException ex) {
            pendingSessionBySocket.remove(socketSession.getId(), sessionId);
            send(socketSession, message("created", sessionId)
                    .put("ok", false)
                    .put("error", "Kubernetes exec create queue is unavailable"));
        }
    }

    private void openExecSession(
            WebSocketSession socketSession,
            String sessionId,
            Long userId,
            String connectionId,
            String namespace,
            String podName,
            String container,
            int cols,
            int rows,
            List<String> command
    ) {
        try {
            if (!socketSession.isOpen() || !sessionId.equals(pendingSessionBySocket.get(socketSession.getId()))) {
                sessionManager.destroy(sessionId);
                return;
            }
            var resolved = connectionContext.requireAvailableConnectionForUser(
                    userId,
                    connectionId,
                    "Connection not found: " + connectionId
            );
            String dbType = resolved.entity().getDbType();
            if (dbType == null || !"kubernetes".equalsIgnoreCase(dbType.trim())) {
                pendingSessionBySocket.remove(socketSession.getId(), sessionId);
                send(socketSession, message("created", sessionId)
                        .put("ok", false)
                        .put("error", "Connection does not support Kubernetes exec"));
                return;
            }
            KubernetesExecSession execSession = sessionManager.create(
                    sessionId,
                    userId,
                    resolved.entity(),
                    namespace,
                    podName,
                    container,
                    cols,
                    rows,
                    command
            );
            if (!socketSession.isOpen() || !sessionId.equals(pendingSessionBySocket.get(socketSession.getId()))) {
                sessionManager.destroy(sessionId);
                pendingSessionBySocket.remove(socketSession.getId(), sessionId);
                return;
            }
            pendingSessionBySocket.remove(socketSession.getId(), sessionId);
            execSessionBySocket.put(socketSession.getId(), sessionId);
            Object sendLock = sendLocksBySocket.computeIfAbsent(socketSession.getId(), ignored -> new Object());
            TerminalWsOutputBridge outputBridge = new TerminalWsOutputBridge(
                    socketSession,
                    objectMapper,
                    sessionId,
                    sendLock
            );
            closeOutputBridge(sessionId);
            outputBridgeBySessionId.put(sessionId, outputBridge);
            execSession.pumpOutput(
                    outputBridge::accept,
                    code -> {
                        closeOutputBridge(sessionId);
                        send(socketSession, message("exit", sessionId).put("code", code));
                        destroySession(
                                socketSession,
                                sessionId,
                                userId,
                                "k8s.exec.exit",
                                "exitCode=" + code + "; connectionId=" + connectionId
                                        + "; pod=" + namespace + "/" + podName
                        );
                    }
            );
            teamService.recordTerminalAudit(
                    userId,
                    "k8s.exec.open",
                    "sessionId=" + sessionId
                            + "; connectionId=" + connectionId
                            + "; pod=" + namespace + "/" + podName
                            + (container == null || container.isBlank() ? "" : "; container=" + container)
                            + "; cols=" + cols
                            + "; rows=" + rows
            );
            send(socketSession, message("created", sessionId).put("ok", true));
        } catch (Exception ex) {
            pendingSessionBySocket.remove(socketSession.getId(), sessionId);
            sessionManager.destroy(sessionId);
            ExceptionLogging.warn(log, "k8s.exec.create sessionId=" + sessionId, ex);
            send(socketSession, message("created", sessionId).put("ok", false).put("error", userMessage(ex)));
        }
    }

    private void handleWrite(WebSocketSession socketSession, String sessionId, String data) throws IOException {
        if (!requireActiveOwner(socketSession, sessionId)) {
            return;
        }
        KubernetesExecSession execSession = sessionManager.get(sessionId);
        if (execSession == null) {
            return;
        }
        sessionManager.touch(sessionId);
        execSession.write(data);
    }

    private void handleResize(WebSocketSession socketSession, String sessionId, int cols, int rows) {
        if (!requireActiveOwner(socketSession, sessionId)) {
            return;
        }
        KubernetesExecSession execSession = sessionManager.get(sessionId);
        if (execSession == null) {
            return;
        }
        sessionManager.touch(sessionId);
        execSession.resize(cols, rows);
    }

    private void handlePing(WebSocketSession socketSession, String sessionId) {
        if (!requireActiveOwner(socketSession, sessionId)) {
            return;
        }
        if (sessionManager.get(sessionId) == null) {
            return;
        }
        sessionManager.touch(sessionId);
        send(socketSession, message("pong", sessionId));
    }

    private void handleDestroy(WebSocketSession socketSession, String sessionId) {
        Long userId = userId(socketSession);
        boolean pending = sessionId.equals(pendingSessionBySocket.get(socketSession.getId()));
        boolean mapped = sessionId.equals(execSessionBySocket.get(socketSession.getId()));
        if (!pending && !mapped && !sessionManager.isOwner(sessionId, userId)) {
            log.debug("Ignoring k8s exec WS destroy for unknown session {} by user {}", sessionId, userId);
            return;
        }
        pendingSessionBySocket.remove(socketSession.getId(), sessionId);
        destroySession(socketSession, sessionId, userId, "k8s.exec.close");
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
        String connectionId = sessionManager.getConnectionId(sessionId);
        sessionManager.destroy(sessionId);
        execSessionBySocket.remove(socketSession.getId(), sessionId);
        pendingSessionBySocket.remove(socketSession.getId(), sessionId);
        String detail = "sessionId=" + sessionId;
        if (connectionId != null && !connectionId.isBlank()) {
            detail = detail + "; connectionId=" + connectionId;
        }
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

    private boolean requireActiveOwner(WebSocketSession socketSession, String sessionId) {
        Long userId = userId(socketSession);
        if (sessionManager.isOwner(sessionId, userId)) {
            return true;
        }
        if (sessionId.equals(pendingSessionBySocket.get(socketSession.getId()))
                || sessionId.equals(execSessionBySocket.get(socketSession.getId()))
                || sessionManager.get(sessionId) == null) {
            return false;
        }
        log.debug("Ignoring unauthorized k8s exec WS action for session {} by user {}", sessionId, userId);
        return false;
    }

    private Long userId(WebSocketSession socketSession) {
        return (Long) socketSession.getAttributes().get(K8sExecSessionHandshakeInterceptor.ATTR_USER_ID);
    }

    private String connectionId(WebSocketSession socketSession) {
        return (String) socketSession.getAttributes().get(K8sExecSessionHandshakeInterceptor.ATTR_CONNECTION_ID);
    }

    private ObjectNode message(String type, String sessionId) {
        return objectMapper.createObjectNode()
                .put("type", type)
                .put("sessionId", sessionId);
    }

    private void send(WebSocketSession session, ObjectNode node) {
        if (!session.isOpen()) {
            return;
        }
        String socketId = session.getId();
        Object lock = socketId == null || socketId.isBlank()
                ? new Object()
                : sendLocksBySocket.computeIfAbsent(socketId, ignored -> new Object());
        synchronized (lock) {
            if (!session.isOpen()) {
                return;
            }
            try {
                session.sendMessage(new TextMessage(objectMapper.writeValueAsString(node)));
            } catch (IOException ex) {
                log.debug("Failed to send k8s exec WS message", ex);
            }
        }
    }

    private static List<String> readCommand(JsonNode node) {
        if (node == null || !node.isArray() || node.isEmpty()) {
            return List.of();
        }
        List<String> command = new ArrayList<>();
        for (JsonNode item : node) {
            if (item != null && item.isTextual() && !item.asText("").isBlank()) {
                command.add(item.asText());
            }
        }
        return command;
    }

    private static String userMessage(Exception ex) {
        if (ex.getMessage() != null && !ex.getMessage().isBlank()) {
            return ex.getMessage();
        }
        return "Kubernetes exec failed";
    }
}
