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
@EnableConfigurationProperties(TerminalWebSocketProperties.class)
public class TerminalWebSocketConfig implements WebSocketConfigurer {

    private final TerminalWebSocketProperties properties;
    private final TerminalWebSocketHandler terminalWebSocketHandler;
    private final SessionStore sessionStore;
    private final TeamService teamService;

    public TerminalWebSocketConfig(
            TerminalWebSocketProperties properties,
            TerminalWebSocketHandler terminalWebSocketHandler,
            SessionStore sessionStore,
            TeamService teamService
    ) {
        this.properties = properties;
        this.terminalWebSocketHandler = terminalWebSocketHandler;
        this.sessionStore = sessionStore;
        this.teamService = teamService;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        if (!properties.isEnabled()) {
            return;
        }
        registry.addHandler(terminalWebSocketHandler, properties.getPath())
                .addInterceptors(new TerminalSessionHandshakeInterceptor(sessionStore, properties, teamService))
                .setHandshakeHandler(new SessionAwareHandshakeHandler())
                .setAllowedOriginPatterns("*");
    }
}
