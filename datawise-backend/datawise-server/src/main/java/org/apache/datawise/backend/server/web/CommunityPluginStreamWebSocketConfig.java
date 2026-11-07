package org.apache.datawise.backend.server.web;

import org.apache.datawise.backend.configstore.SessionStore;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class CommunityPluginStreamWebSocketConfig implements WebSocketConfigurer {

    private final CommunityPluginStreamWebSocketHandler handler;
    private final SessionStore sessionStore;

    public CommunityPluginStreamWebSocketConfig(
            CommunityPluginStreamWebSocketHandler handler,
            SessionStore sessionStore
    ) {
        this.handler = handler;
        this.sessionStore = sessionStore;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/community-plugin-stream")
                .addInterceptors(new CommunityPluginStreamHandshakeInterceptor(sessionStore))
                .setHandshakeHandler(new SessionAwareHandshakeHandler())
                .setAllowedOriginPatterns("*");
    }
}
