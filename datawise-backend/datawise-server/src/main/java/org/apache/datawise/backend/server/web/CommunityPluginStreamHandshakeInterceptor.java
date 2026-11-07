package org.apache.datawise.backend.server.web;

import org.apache.datawise.backend.configstore.SessionStore;
import org.apache.datawise.backend.model.SessionEntity;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;
import java.util.Optional;

/**
 * Authenticates community plugin stream sockets and captures {@code pluginId}.
 */
public class CommunityPluginStreamHandshakeInterceptor implements HandshakeInterceptor {

    public static final String ATTR_USER_ID = "userId";
    public static final String ATTR_PLUGIN_ID = "pluginId";

    private final SessionStore sessionStore;

    public CommunityPluginStreamHandshakeInterceptor(SessionStore sessionStore) {
        this.sessionStore = sessionStore;
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
        if (session.isEmpty() || session.get().isGuest()) {
            return false;
        }
        String pluginId = WebSocketSessionAuthSupport.queryParam(request, "pluginId");
        if (pluginId == null || pluginId.isBlank()) {
            return false;
        }
        attributes.put(ATTR_USER_ID, session.get().getUserId());
        attributes.put(ATTR_PLUGIN_ID, pluginId.trim());
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
