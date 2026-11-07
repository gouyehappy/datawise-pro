package org.apache.datawise.backend.server.web;

import org.junit.jupiter.api.Test;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WebSocketSessionAuthSupportTest {

    @Test
    void prefersSecWebSocketProtocolWithoutWritingResponseHeader() {
        MockHttpServletRequest servletRequest = new MockHttpServletRequest("GET", "/ws/ssh-shell");
        servletRequest.addHeader("Sec-WebSocket-Protocol", "session-abc123");
        servletRequest.setQueryString("dwSession=session-from-query&connectionId=conn-1");
        ServletServerHttpRequest request = new ServletServerHttpRequest(servletRequest);
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();
        ServletServerHttpResponse response = new ServletServerHttpResponse(servletResponse);

        String sessionId = WebSocketSessionAuthSupport.resolveSessionId(request, response);

        assertEquals("session-abc123", sessionId);
        // Echoing belongs to SessionAwareHandshakeHandler — duplicate values break browsers.
        assertTrue(response.getHeaders().getOrEmpty("Sec-WebSocket-Protocol").isEmpty());
        assertNull(servletResponse.getHeader("Sec-WebSocket-Protocol"));
    }

    @Test
    void fallsBackToDwSessionQueryParam() {
        MockHttpServletRequest servletRequest = new MockHttpServletRequest("GET", "/ws/ssh-shell");
        servletRequest.setQueryString("dwSession=session-from-query");
        ServletServerHttpRequest request = new ServletServerHttpRequest(servletRequest);
        ServletServerHttpResponse response = new ServletServerHttpResponse(new MockHttpServletResponse());

        assertEquals(
                "session-from-query",
                WebSocketSessionAuthSupport.resolveSessionId(request, response)
        );
    }
}
