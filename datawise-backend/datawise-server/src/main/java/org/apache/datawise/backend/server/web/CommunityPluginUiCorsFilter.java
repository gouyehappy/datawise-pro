package org.apache.datawise.backend.server.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;
import org.springframework.http.HttpHeaders;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Opaque-origin workbench iframes ({@code sandbox} without {@code allow-same-origin})
 * fetch packaged UI modules/CSS with {@code Origin: null}. Spring's {@code DefaultCorsProcessor}
 * writes ACAO via {@code addHeader}; a second writer (controller, proxy, or a second CORS
 * pass) yields the illegal multi-value {@code null, null} browsers reject.
 *
 * <p>For community-plugin UI asset requests, coerce ACAO writes to {@code setHeader} so only
 * one value survives.
 */
public final class CommunityPluginUiCorsFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        if (!SessionAuthFilter.isCommunityPluginUiAssetRequest(request)) {
            filterChain.doFilter(request, response);
            return;
        }
        String origin = request.getHeader(HttpHeaders.ORIGIN);
        boolean opaqueNull = origin != null && "null".equalsIgnoreCase(origin.trim());
        if (!opaqueNull) {
            filterChain.doFilter(request, response);
            return;
        }
        filterChain.doFilter(request, new SingleAcaoResponse(response));
    }

    /** Turns ACAO {@code addHeader} into {@code setHeader} so duplicates cannot accumulate. */
    private static final class SingleAcaoResponse extends HttpServletResponseWrapper {
        private SingleAcaoResponse(HttpServletResponse response) {
            super(response);
        }

        @Override
        public void setHeader(String name, String value) {
            if (isAllowOrigin(name)) {
                super.setHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, value);
                return;
            }
            super.setHeader(name, value);
        }

        @Override
        public void addHeader(String name, String value) {
            if (isAllowOrigin(name)) {
                super.setHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, value);
                return;
            }
            super.addHeader(name, value);
        }

        private static boolean isAllowOrigin(String name) {
            return name != null && HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN.equalsIgnoreCase(name);
        }
    }
}
