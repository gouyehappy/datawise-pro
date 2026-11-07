package org.apache.datawise.backend.server.web;

import org.apache.datawise.backend.configstore.SessionStore;
import org.apache.datawise.backend.service.TeamService;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
@EnableConfigurationProperties(K8sExecWebSocketProperties.class)
public class K8sExecWebSocketConfig implements WebSocketConfigurer {

    private final K8sExecWebSocketProperties properties;
    private final K8sExecWebSocketHandler k8sExecWebSocketHandler;
    private final SessionStore sessionStore;
    private final TeamService teamService;

    public K8sExecWebSocketConfig(
            K8sExecWebSocketProperties properties,
            K8sExecWebSocketHandler k8sExecWebSocketHandler,
            SessionStore sessionStore,
            TeamService teamService
    ) {
        this.properties = properties;
        this.k8sExecWebSocketHandler = k8sExecWebSocketHandler;
        this.sessionStore = sessionStore;
        this.teamService = teamService;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        if (!properties.isEnabled()) {
            return;
        }
        registry.addHandler(k8sExecWebSocketHandler, properties.getPath())
                .addInterceptors(new K8sExecSessionHandshakeInterceptor(sessionStore, properties, teamService))
                .setHandshakeHandler(new SessionAwareHandshakeHandler())
                .setAllowedOriginPatterns("*");
    }
}
