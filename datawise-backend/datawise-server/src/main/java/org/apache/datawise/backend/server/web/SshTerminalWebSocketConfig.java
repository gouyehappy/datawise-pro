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
@EnableConfigurationProperties(SshTerminalWebSocketProperties.class)
public class SshTerminalWebSocketConfig implements WebSocketConfigurer {

    private final SshTerminalWebSocketProperties properties;
    private final SshTerminalWebSocketHandler sshTerminalWebSocketHandler;
    private final SessionStore sessionStore;
    private final TeamService teamService;

    public SshTerminalWebSocketConfig(
            SshTerminalWebSocketProperties properties,
            SshTerminalWebSocketHandler sshTerminalWebSocketHandler,
            SessionStore sessionStore,
            TeamService teamService
    ) {
        this.properties = properties;
        this.sshTerminalWebSocketHandler = sshTerminalWebSocketHandler;
        this.sessionStore = sessionStore;
        this.teamService = teamService;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        if (!properties.isEnabled()) {
            return;
        }
        registry.addHandler(sshTerminalWebSocketHandler, properties.getPath())
                .addInterceptors(new SshTerminalSessionHandshakeInterceptor(sessionStore, properties, teamService))
                .setHandshakeHandler(new SessionAwareHandshakeHandler())
                .setAllowedOriginPatterns("*");
    }
}
