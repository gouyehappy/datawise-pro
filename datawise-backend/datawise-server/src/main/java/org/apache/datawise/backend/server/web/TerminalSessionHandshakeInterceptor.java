package org.apache.datawise.backend.server.web;

import org.apache.datawise.backend.configstore.SessionStore;
import org.apache.datawise.backend.model.SessionEntity;
import org.apache.datawise.backend.service.TeamService;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;
import java.util.Optional;

public class TerminalSessionHandshakeInterceptor implements HandshakeInterceptor {

    public static final String ATTR_USER_ID = "userId";
    public static final String ATTR_GUEST = "guest";

    private final SessionStore sessionStore;
    private final TerminalWebSocketProperties properties;
    private final TeamService teamService;

    public TerminalSessionHandshakeInterceptor(
            SessionStore sessionStore,
            TerminalWebSocketProperties properties,
            TeamService teamService
    ) {
        this.sessionStore = sessionStore;
        this.properties = properties;
        this.teamService = teamService;
    }

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Map<String, Object> attributes
    ) {
        String sessionId = WebSocketSessionAuthSupport.resolveSessionId(request, response);
        if (sessionId == null) {
            return false;
        }
        Optional<SessionEntity> session = sessionStore.authenticate(sessionId);
        // Local PTY is host shell access — guests must not get a shell on this machine.
        if (session.isEmpty() || session.get().isGuest()) {
            return false;
        }
        String clientIp = TerminalClientIpSupport.resolveClientIp(request, properties.getTrustedProxyIps());
        if (!TerminalIpWhitelistSupport.isAllowed(clientIp, properties.getAllowedIps())) {
            teamService.recordTerminalAudit(
                    session.get().getUserId(),
                    "terminal.pty.denied",
                    "reason=ip-not-allowed; clientIp=" + (clientIp != null ? clientIp : "unknown")
            );
            return false;
        }
        attributes.put(ATTR_USER_ID, session.get().getUserId());
        attributes.put(ATTR_GUEST, false);
        return true;
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Exception exception
    ) {
        // no-op
    }
}
