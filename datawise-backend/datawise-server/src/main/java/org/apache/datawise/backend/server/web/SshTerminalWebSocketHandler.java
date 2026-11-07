package org.apache.datawise.backend.server.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.connector.ssh.SshConnectionException;
import org.apache.datawise.backend.connector.ssh.SshShellEntityResolver;
import org.apache.datawise.backend.connector.ssh.SshShellSession;
import org.apache.datawise.backend.connector.ssh.SshShellSessionManager;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
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
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class SshTerminalWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(SshTerminalWebSocketHandler.class);
    private static final AtomicInteger CREATE_THREAD_SEQ = new AtomicInteger();
    private static final AtomicInteger FLUSH_THREAD_SEQ = new AtomicInteger();
    private static final AtomicInteger GRACE_THREAD_SEQ = new AtomicInteger();
    /** Cap concurrent JSch create handshakes (was unbounded cached pool). */
    private static final int CREATE_POOL_SIZE = Math.max(4, Math.min(32, Runtime.getRuntime().availableProcessors() * 2));

    private final SshShellSessionManager sessionManager;
    private final ConnectionExecutionContext connectionContext;
    private final TeamService teamService;
    private final ObjectMapper objectMapper;
    private final SshTerminalWebSocketProperties websocketProperties;
    /** Active shell after successful create / resume. */
    private final Map<String, String> shellSessionBySocket = new ConcurrentHashMap<>();
    /** Reverse map for steal/reattach. */
    private final Map<String, String> socketByShellSession = new ConcurrentHashMap<>();
    /** sessionId reserved while async JSch connect is in flight. */
    private final Map<String, String> pendingSessionBySocket = new ConcurrentHashMap<>();
    private final Map<String, Object> sendLocksBySocket = new ConcurrentHashMap<>();
    private final Map<String, TerminalWsOutputBridge> outputBridgeBySessionId = new ConcurrentHashMap<>();
    private final Map<String, ScheduledFuture<?>> graceDestroyBySession = new ConcurrentHashMap<>();
    /** Don't block Tomcat WebSocket threads on JSch TCP handshake. Bounded pool. */
    private final ExecutorService shellCreateExecutor = Executors.newFixedThreadPool(
            CREATE_POOL_SIZE,
            r -> {
                Thread thread = new Thread(r, "ssh-shell-create-" + CREATE_THREAD_SEQ.incrementAndGet());
                thread.setDaemon(true);
                return thread;
            }
    );
    private final ScheduledExecutorService outputFlushScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "ssh-shell-flush-" + FLUSH_THREAD_SEQ.incrementAndGet());
        thread.setDaemon(true);
        return thread;
    });
    private final ScheduledExecutorService resumeGraceScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "ssh-shell-resume-grace-" + GRACE_THREAD_SEQ.incrementAndGet());
        thread.setDaemon(true);
        return thread;
    });

    public SshTerminalWebSocketHandler(
            SshShellSessionManager sessionManager,
            ConnectionExecutionContext connectionContext,
            TeamService teamService,
            ObjectMapper objectMapper,
            SshTerminalWebSocketProperties websocketProperties
    ) {
        this.sessionManager = sessionManager;
        this.connectionContext = connectionContext;
        this.teamService = teamService;
        this.objectMapper = objectMapper;
        this.websocketProperties = websocketProperties != null
                ? websocketProperties
                : new SshTerminalWebSocketProperties();
    }

    @PreDestroy
    void shutdownShellCreateExecutor() {
        for (ScheduledFuture<?> future : graceDestroyBySession.values()) {
            future.cancel(false);
        }
        graceDestroyBySession.clear();
        shellCreateExecutor.shutdownNow();
        outputFlushScheduler.shutdownNow();
        resumeGraceScheduler.shutdownNow();
        try {
            if (!shellCreateExecutor.awaitTermination(3, TimeUnit.SECONDS)) {
                log.debug("SSH shell create executor did not terminate within 3s");
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
        try {
            if (!outputFlushScheduler.awaitTermination(1, TimeUnit.SECONDS)) {
                log.debug("SSH shell flush scheduler did not terminate within 1s");
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
        try {
            if (!resumeGraceScheduler.awaitTermination(1, TimeUnit.SECONDS)) {
                log.debug("SSH shell resume-grace scheduler did not terminate within 1s");
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
            default -> log.debug("Ignoring unknown SSH terminal WS message type: {}", type);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String socketId = session.getId();
        String pendingSessionId = pendingSessionBySocket.remove(socketId);
        String activeSessionId = shellSessionBySocket.remove(socketId);
        Long userId = userId(session);
        if (pendingSessionId != null) {
            // Never opened — no resume value; tear down immediately.
            destroySessionById(pendingSessionId, userId, "ssh.shell.disconnect", "pending");
        }
        if (activeSessionId != null && !activeSessionId.equals(pendingSessionId)) {
            socketByShellSession.remove(activeSessionId, socketId);
            detachForResume(activeSessionId, userId);
        }
        sendLocksBySocket.remove(socketId);
    }

    private void handleCreate(WebSocketSession socketSession, String sessionId, JsonNode payload) {
        Long userId = userId(socketSession);
        String connectionId = connectionId(socketSession);
        int cols = payload.path("cols").asInt(80);
        int rows = payload.path("rows").asInt(24);
        if (userId == null || connectionId == null || connectionId.isBlank()) {
            send(socketSession, message("created", sessionId)
                    .put("ok", false)
                    .put("error", "SSH terminal session is not authenticated"));
            return;
        }
        pendingSessionBySocket.put(socketSession.getId(), sessionId);
        try {
            shellCreateExecutor.execute(
                    () -> openOrResumeShellSession(socketSession, sessionId, userId, connectionId, cols, rows)
            );
        } catch (RejectedExecutionException ex) {
            pendingSessionBySocket.remove(socketSession.getId(), sessionId);
            send(socketSession, message("created", sessionId)
                    .put("ok", false)
                    .put("error", "SSH shell create queue is unavailable"));
        }
    }

    private void openOrResumeShellSession(
            WebSocketSession socketSession,
            String sessionId,
            Long userId,
            String connectionId,
            int cols,
            int rows
    ) {
        try {
            if (!socketSession.isOpen() || !sessionId.equals(pendingSessionBySocket.get(socketSession.getId()))) {
                return;
            }
            SshShellSession existing = sessionManager.get(sessionId);
            if (existing != null
                    && existing.isOpen()
                    && sessionManager.isOwner(sessionId, userId)
                    && connectionId.equals(sessionManager.getConnectionId(sessionId))) {
                cancelGraceDestroy(sessionId);
                if (!socketSession.isOpen() || !sessionId.equals(pendingSessionBySocket.get(socketSession.getId()))) {
                    scheduleGraceDestroy(sessionId, userId);
                    return;
                }
                pendingSessionBySocket.remove(socketSession.getId(), sessionId);
                bindOutput(socketSession, sessionId, userId, connectionId, cols, rows, true);
                return;
            }
            var resolved = connectionContext.requireAvailableConnectionForUser(
                    userId,
                    connectionId,
                    "Connection not found: " + connectionId
            );
            if (!SshShellEntityResolver.supportsInteractiveShell(resolved.entity())) {
                pendingSessionBySocket.remove(socketSession.getId(), sessionId);
                send(socketSession, message("created", sessionId)
                        .put("ok", false)
                        .put("error", "Connection does not support SSH shell"));
                return;
            }
            var shellEntity = SshShellEntityResolver.resolveForShell(resolved.entity());
            cancelGraceDestroy(sessionId);
            SshShellSession shellSession = sessionManager.create(
                    sessionId,
                    userId,
                    shellEntity,
                    cols,
                    rows
            );
            if (!socketSession.isOpen() || !sessionId.equals(pendingSessionBySocket.get(socketSession.getId()))) {
                // Client abandoned the WebSocket while JSch was connecting — do not leak the shell.
                sessionManager.destroy(sessionId);
                pendingSessionBySocket.remove(socketSession.getId(), sessionId);
                return;
            }
            pendingSessionBySocket.remove(socketSession.getId(), sessionId);
            bindOutput(socketSession, sessionId, userId, connectionId, cols, rows, false);
        } catch (SshConnectionException ex) {
            pendingSessionBySocket.remove(socketSession.getId(), sessionId);
            ExceptionLogging.warn(log, "ssh.shell.create sessionId=" + sessionId, ex);
            send(socketSession, message("created", sessionId).put("ok", false).put("error", ex.getMessage()));
        } catch (Exception ex) {
            pendingSessionBySocket.remove(socketSession.getId(), sessionId);
            sessionManager.destroy(sessionId);
            ExceptionLogging.warn(log, "ssh.shell.create sessionId=" + sessionId, ex);
            send(socketSession, message("created", sessionId).put("ok", false).put("error", userMessage(ex)));
        }
    }

    private void bindOutput(
            WebSocketSession socketSession,
            String sessionId,
            Long userId,
            String connectionId,
            int cols,
            int rows,
            boolean resumed
    ) {
        SshShellSession shellSession = sessionManager.get(sessionId);
        if (shellSession == null || !shellSession.isOpen()) {
            send(socketSession, message("created", sessionId)
                    .put("ok", false)
                    .put("error", resumed ? "SSH shell resume failed (session gone)" : "SSH shell missing after create"));
            return;
        }
        String previousSocket = socketByShellSession.put(sessionId, socketSession.getId());
        if (previousSocket != null && !previousSocket.equals(socketSession.getId())) {
            shellSessionBySocket.remove(previousSocket, sessionId);
        }
        shellSessionBySocket.put(socketSession.getId(), sessionId);
        Object sendLock = sendLocksBySocket.computeIfAbsent(socketSession.getId(), ignored -> new Object());
        TerminalWsOutputBridge outputBridge = new TerminalWsOutputBridge(
                socketSession,
                objectMapper,
                sessionId,
                sendLock,
                outputFlushScheduler
        );
        closeOutputBridge(sessionId);
        outputBridgeBySessionId.put(sessionId, outputBridge);
        shellSession.attachOutput(
                outputBridge::accept,
                code -> {
                    closeOutputBridge(sessionId);
                    send(socketSession, message("exit", sessionId).put("code", code));
                    destroySessionById(
                            sessionId,
                            userId,
                            "ssh.shell.exit",
                            "exitCode=" + code + "; connectionId=" + connectionId
                    );
                }
        );
        if (resumed) {
            shellSession.resize(cols, rows);
            sessionManager.touch(sessionId);
            teamService.recordTerminalAudit(
                    userId,
                    "ssh.shell.resume",
                    "sessionId=" + sessionId
                            + "; connectionId=" + connectionId
                            + "; cols=" + cols
                            + "; rows=" + rows
            );
            send(socketSession, message("created", sessionId).put("ok", true).put("resumed", true));
            return;
        }
        teamService.recordTerminalAudit(
                userId,
                "ssh.shell.open",
                "sessionId=" + sessionId
                        + "; connectionId=" + connectionId
                        + "; cols=" + cols
                        + "; rows=" + rows
        );
        send(socketSession, message("created", sessionId).put("ok", true).put("resumed", false));
    }

    private void detachForResume(String sessionId, Long userId) {
        closeOutputBridge(sessionId);
        SshShellSession shell = sessionManager.get(sessionId);
        if (shell == null || !shell.isOpen()) {
            destroySessionById(sessionId, userId, "ssh.shell.disconnect", "already-closed");
            return;
        }
        shell.detachOutput();
        int graceMs = websocketProperties.getResumeGraceMs();
        if (graceMs <= 0) {
            destroySessionById(sessionId, userId, "ssh.shell.disconnect", "resume-disabled");
            return;
        }
        scheduleGraceDestroy(sessionId, userId);
        String connectionId = sessionManager.getConnectionId(sessionId);
        String detail = "sessionId=" + sessionId + "; graceMs=" + graceMs;
        if (connectionId != null && !connectionId.isBlank()) {
            detail = detail + "; connectionId=" + connectionId;
        }
        teamService.recordTerminalAudit(userId, "ssh.shell.detach", detail);
        log.info("Detached SSH shell for resume sessionId={} graceMs={}", sessionId, graceMs);
    }

    private void scheduleGraceDestroy(String sessionId, Long userId) {
        cancelGraceDestroy(sessionId);
        int graceMs = websocketProperties.getResumeGraceMs();
        if (graceMs <= 0) {
            destroySessionById(sessionId, userId, "ssh.shell.disconnect", "grace-expired");
            return;
        }
        ScheduledFuture<?> future = resumeGraceScheduler.schedule(
                () -> destroySessionById(sessionId, userId, "ssh.shell.disconnect", "grace-expired"),
                graceMs,
                TimeUnit.MILLISECONDS
        );
        graceDestroyBySession.put(sessionId, future);
    }

    private void cancelGraceDestroy(String sessionId) {
        ScheduledFuture<?> future = graceDestroyBySession.remove(sessionId);
        if (future != null) {
            future.cancel(false);
        }
    }

    private void handleWrite(WebSocketSession socketSession, String sessionId, String data) throws IOException {
        if (!requireActiveOwner(socketSession, sessionId)) {
            return;
        }
        SshShellSession shellSession = sessionManager.get(sessionId);
        if (shellSession == null) {
            return;
        }
        sessionManager.touch(sessionId);
        shellSession.write(data);
    }

    private void handleResize(WebSocketSession socketSession, String sessionId, int cols, int rows) {
        if (!requireActiveOwner(socketSession, sessionId)) {
            return;
        }
        SshShellSession shellSession = sessionManager.get(sessionId);
        if (shellSession == null) {
            return;
        }
        sessionManager.touch(sessionId);
        shellSession.resize(cols, rows);
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
        // Allow destroy for pending creates (session may not be owned in manager yet).
        Long userId = userId(socketSession);
        boolean pending = sessionId.equals(pendingSessionBySocket.get(socketSession.getId()));
        boolean mapped = sessionId.equals(shellSessionBySocket.get(socketSession.getId()));
        if (!pending && !mapped && !sessionManager.isOwner(sessionId, userId)) {
            // Soft-ignore stale destroy (e.g. client teardown after server already closed the shell).
            log.debug("Ignoring SSH terminal WS destroy for unknown session {} by user {}", sessionId, userId);
            return;
        }
        pendingSessionBySocket.remove(socketSession.getId(), sessionId);
        destroySessionById(sessionId, userId, "ssh.shell.close", null);
    }

    private void destroySessionById(String sessionId, Long userId, String action, String extraDetail) {
        cancelGraceDestroy(sessionId);
        closeOutputBridge(sessionId);
        String connectionId = sessionManager.getConnectionId(sessionId);
        String socketId = socketByShellSession.remove(sessionId);
        if (socketId != null) {
            shellSessionBySocket.remove(socketId, sessionId);
        }
        sessionManager.destroy(sessionId);
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

    /**
     * True only when the shell exists and belongs to this user.
     * Pending/closed sessions are soft-ignored — never FORBIDDEN — so early resize/ping
     * during async create cannot tear down a healthy WebSocket.
     */
    private boolean requireActiveOwner(WebSocketSession socketSession, String sessionId) {
        Long userId = userId(socketSession);
        if (sessionManager.isOwner(sessionId, userId)
                && sessionId.equals(shellSessionBySocket.get(socketSession.getId()))) {
            return true;
        }
        // Soft-deny: still creating, already closed, detached, or race after destroy.
        if (sessionId.equals(pendingSessionBySocket.get(socketSession.getId()))
                || sessionId.equals(shellSessionBySocket.get(socketSession.getId()))
                || sessionManager.get(sessionId) == null) {
            return false;
        }
        log.debug("Ignoring unauthorized SSH terminal WS action for session {} by user {}", sessionId, userId);
        return false;
    }

    private Long userId(WebSocketSession socketSession) {
        return (Long) socketSession.getAttributes().get(SshTerminalSessionHandshakeInterceptor.ATTR_USER_ID);
    }

    private String connectionId(WebSocketSession socketSession) {
        return (String) socketSession.getAttributes().get(SshTerminalSessionHandshakeInterceptor.ATTR_CONNECTION_ID);
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
                log.debug("Failed to send SSH terminal WS message", ex);
            }
        }
    }

    private static String userMessage(Exception ex) {
        if (ex.getMessage() != null && !ex.getMessage().isBlank()) {
            return ex.getMessage();
        }
        return "SSH shell failed";
    }
}
