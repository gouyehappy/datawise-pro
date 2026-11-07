package org.apache.datawise.backend.server.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.AuthService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

/**
 * Blocks API use until accounts still on the shipped sample password hash change it.
 * Allows session probe, password change, and sign-out only.
 */
public class PasswordChangeRequiredFilter extends OncePerRequestFilter {

    public static final String PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED";

    private final UserStore userStore;
    private final CorsOriginAllowlist corsOriginAllowlist;

    public PasswordChangeRequiredFilter(UserStore userStore) {
        this(userStore, CorsOriginAllowlist.defaults());
    }

    public PasswordChangeRequiredFilter(UserStore userStore, CorsOriginAllowlist corsOriginAllowlist) {
        this.userStore = userStore;
        this.corsOriginAllowlist = corsOriginAllowlist != null
                ? corsOriginAllowlist
                : CorsOriginAllowlist.defaults();
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }
        Long userId = UserContext.getUserId();
        if (userId == null || UserContext.isGuest() || UserContext.isApiTokenAuth()) {
            filterChain.doFilter(request, response);
            return;
        }
        String path = request.getRequestURI();
        if (isAllowedWhilePasswordChangeRequired(path, request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }
        Optional<UserEntity> user = userStore.findById(userId);
        if (user.isEmpty() || !AuthService.usesShippedSamplePassword(user.get())) {
            filterChain.doFilter(request, response);
            return;
        }
        writeForbidden(request, response);
    }

    static boolean isAllowedWhilePasswordChangeRequired(String path, String method) {
        if (path == null) {
            return false;
        }
        String normalized = path;
        int query = normalized.indexOf('?');
        if (query >= 0) {
            normalized = normalized.substring(0, query);
        }
        if ("/signOut".equals(normalized) && "POST".equalsIgnoreCase(method)) {
            return true;
        }
        if ("/api/auth/change-password".equals(normalized) && "POST".equalsIgnoreCase(method)) {
            return true;
        }
        if ("/api/auth/session".equals(normalized) && "GET".equalsIgnoreCase(method)) {
            return true;
        }
        if ("/api/health".equals(normalized)) {
            return true;
        }
        return false;
    }

    private void writeForbidden(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String origin = request.getHeader(HttpHeaders.ORIGIN);
        String allowed = corsOriginAllowlist.resolveAllowedOrigin(origin);
        if (allowed != null) {
            response.setHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, allowed);
            response.setHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true");
            response.setHeader(HttpHeaders.VARY, HttpHeaders.ORIGIN);
        }
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(
                "{\"code\":-1,\"msg\":\"" + PASSWORD_CHANGE_REQUIRED
                        + "\",\"data\":{\"errorCode\":\"" + PASSWORD_CHANGE_REQUIRED + "\"}}"
        );
    }
}
