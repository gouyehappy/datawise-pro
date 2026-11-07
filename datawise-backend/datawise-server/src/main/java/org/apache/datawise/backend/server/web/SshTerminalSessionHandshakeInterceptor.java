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

public class SshTerminalSessionHandshakeInterceptor implements HandshakeInterceptor {

    public static final String ATTR_USER_ID = "userId";
    public static final String ATTR_CONNECTION_ID = "connectionId";

    private final SessionStore sessionStore;
    private final SshTerminalWebSocketProperties properties;
    private final TeamService teamService;

    public SshTerminalSessionHandshakeInterceptor(
            SessionStore sessionStore,
            SshTerminalWebSocketProperties properties,
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
        String connectionId = WebSocketSessionAuthSupport.queryParam(request, "connectionId");
        if (sessionId == null || connectionId == null || connectionId.isBlank()) {
            return false;
        }
        Optional<SessionEntity> session = sessionStore.authenticate(sessionId);
        if (session.isEmpty() || session.get().isGuest()) {
            return false;
        }
        String clientIp = TerminalClientIpSupport.resolveClientIp(request, properties.getTrustedProxyIps());
        if (!TerminalIpWhitelistSupport.isAllowed(clientIp, properties.getAllowedIps())) {
            teamService.recordTerminalAudit(
                    session.get().getUserId(),
                    "ssh.shell.denied",
                    "reason=ip-not-allowed; clientIp=" + (clientIp != null ? clientIp : "unknown")
                            + "; connectionId=" + connectionId
            );
            return false;
        }
        attributes.put(ATTR_USER_ID, session.get().getUserId());
        attributes.put(ATTR_CONNECTION_ID, connectionId.trim());
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
