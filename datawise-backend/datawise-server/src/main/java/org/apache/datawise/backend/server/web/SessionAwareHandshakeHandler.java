package org.apache.datawise.backend.server.web;

import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.support.DefaultHandshakeHandler;

import java.util.List;

/**
 * Accepts dynamic {@code session-*} sub-protocols used to carry auth session ids
 * (browser WebSocket cannot set custom headers).
 */
public final class SessionAwareHandshakeHandler extends DefaultHandshakeHandler {

    @Override
    protected String selectProtocol(List<String> requestedProtocols, WebSocketHandler webSocketHandler) {
        String selected = super.selectProtocol(requestedProtocols, webSocketHandler);
        if (selected != null) {
            return selected;
        }
        if (requestedProtocols == null) {
            return null;
        }
        for (String protocol : requestedProtocols) {
            if (protocol == null) {
                continue;
            }
            String trimmed = protocol.trim();
            if (trimmed.regionMatches(true, 0, "session-", 0, "session-".length())
                    && trimmed.length() > "session-".length()) {
                return trimmed;
            }
        }
        return null;
    }
}
