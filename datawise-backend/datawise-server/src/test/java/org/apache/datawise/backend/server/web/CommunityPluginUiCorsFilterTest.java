package org.apache.datawise.backend.server.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Collection;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CommunityPluginUiCorsFilterTest {

    @Test
    void collapsesDuplicateAllowOriginOnOpaqueUiAssetGet() throws Exception {
        CommunityPluginUiCorsFilter filter = new CommunityPluginUiCorsFilter();
        MockHttpServletRequest request = new MockHttpServletRequest("GET",
                "/api/community-plugins/io.datawise.community.kubernetes/ui/assets/index.js");
        request.addHeader(HttpHeaders.ORIGIN, "null");
        MockHttpServletResponse response = new MockHttpServletResponse();

        FilterChain chain = (req, res) -> {
            HttpServletResponse http = (HttpServletResponse) res;
            http.addHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "null");
            http.addHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "null");
        };
        filter.doFilter(request, response, chain);

        Collection<String> values = response.getHeaders(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN);
        assertEquals(1, values.size(), String.valueOf(values));
        assertEquals("null", values.iterator().next());
    }

    @Test
    void leavesNonUiRequestsUntouched() throws Exception {
        CommunityPluginUiCorsFilter filter = new CommunityPluginUiCorsFilter();
        MockHttpServletRequest request = new MockHttpServletRequest("POST",
                "/api/community-plugins/io.datawise.community.kubernetes/invoke");
        request.addHeader(HttpHeaders.ORIGIN, "null");
        MockHttpServletResponse response = new MockHttpServletResponse();

        FilterChain chain = (req, res) -> {
            HttpServletResponse http = (HttpServletResponse) res;
            http.addHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "null");
            http.addHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "null");
        };
        filter.doFilter(request, response, chain);

        assertTrue(response.getHeaders(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN).size() >= 2);
    }
}
