package org.apache.datawise.backend.server.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.config.AuthSecurityProperties;
import org.apache.datawise.backend.configstore.SessionStore;
import org.apache.datawise.backend.model.ApiTokenEntity;
import org.apache.datawise.backend.model.SessionEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.server.communityplugin.CommunityPluginUiTicketService;
import org.apache.datawise.backend.service.ApiTokenService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;

/**
 * HTTP 入口：读 {@link #SESSION_HEADER}、社区插件 UI 的短时 ticket/cookie，或 {@link #API_TOKEN_HEADER}，
 * 校验后写入 {@link UserContext}。
 * 当 {@link AuthSecurityProperties#isRequireAuthentication()} 为 true 时，非公开路径匿名请求返回 401。
 *
 * <p>401 在到达 Spring MVC CORS 之前短路，因此必须在此补齐与 {@code WebConfig} 一致的 CORS 头，
 * 否则浏览器会把真实 401 伪装成网络/CORS 失败，前端无法触发会话恢复。
 */
public class SessionAuthFilter extends OncePerRequestFilter {

    public static final String SESSION_HEADER = "X-DW-Session-Id";
    public static final String API_TOKEN_HEADER = "X-DW-Api-Token";
    public static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private static final Logger log = LoggerFactory.getLogger(SessionAuthFilter.class);

    private final SessionStore sessionStore;
    private final ApiTokenService apiTokenService;
    private final AuthSecurityProperties authSecurityProperties;
    private final CommunityPluginUiTicketService uiTicketService;
    private final CorsOriginAllowlist corsOriginAllowlist;

    public SessionAuthFilter(
            SessionStore sessionStore,
            ApiTokenService apiTokenService,
            AuthSecurityProperties authSecurityProperties,
            CommunityPluginUiTicketService uiTicketService
    ) {
        this.sessionStore = sessionStore;
        this.apiTokenService = apiTokenService;
        this.authSecurityProperties = authSecurityProperties != null
                ? authSecurityProperties
                : new AuthSecurityProperties();
        this.uiTicketService = uiTicketService;
        this.corsOriginAllowlist = new CorsOriginAllowlist(this.authSecurityProperties.getAllowedOriginPatterns());
    }

    public SessionAuthFilter(
            SessionStore sessionStore,
            ApiTokenService apiTokenService,
            AuthSecurityProperties authSecurityProperties
    ) {
        this(sessionStore, apiTokenService, authSecurityProperties, null);
    }

    /** Test / legacy constructor — authentication required by default. */
    public SessionAuthFilter(SessionStore sessionStore, ApiTokenService apiTokenService) {
        this(sessionStore, apiTokenService, new AuthSecurityProperties(), null);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        try {
            if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
                filterChain.doFilter(request, response);
                return;
            }

            boolean communityUiAsset = isCommunityPluginUiAssetRequest(request);
            if (!isLocalRequestAllowed(request, communityUiAsset)) {
                writeForbiddenHost(request, response);
                return;
            }

            boolean authenticated = authenticateSession(request, response) || authenticateApiToken(request);
            if (!authenticated && communityUiAsset) {
                // Workbench iframes run at an opaque origin (sandbox without
                // allow-same-origin), so their cross-site subresource requests cannot
                // carry SameSite cookies. UI assets are static files from signed
                // packages and contain no user data — serve them anonymously; every
                // data surface (bridge REST, WS stream, invoke, storage) stays
                // session-gated.
                filterChain.doFilter(request, response);
                return;
            }
            if (!authenticated && authSecurityProperties.isRequireAuthentication()) {
                String path = request.getRequestURI();
                if (!authSecurityProperties.isPublicPath(path)) {
                    writeUnauthorized(request, response);
                    return;
                }
            }
            filterChain.doFilter(request, response);
        } finally {
            UserContext.clear();
        }
    }

    /**
     * Desktop DNS-rebinding defense: when {@code datawise.security.auth.allowed-hosts} is set,
     * reject non-loopback Host values and browser Origins outside the local CORS allowlist.
     *
     * <p>Opaque-origin workbench iframes send {@code Origin: null} when fetching UI module
     * assets ({@code type=module crossorigin}). That literal origin is not a host spoof —
     * allow it only for community-plugin UI asset GETs.
     */
    private boolean isLocalRequestAllowed(HttpServletRequest request, boolean communityUiAsset) {
        if (!authSecurityProperties.isHostEnforcementEnabled()) {
            return true;
        }
        if (!authSecurityProperties.isAllowedHost(request.getHeader(HttpHeaders.HOST))) {
            return false;
        }
        String origin = request.getHeader(HttpHeaders.ORIGIN);
        if (origin != null && !origin.isBlank() && resolveAllowedCorsOrigin(origin) == null) {
            if (communityUiAsset && "null".equalsIgnoreCase(origin.trim())) {
                return true;
            }
            return false;
        }
        return true;
    }

    private boolean authenticateSession(HttpServletRequest request, HttpServletResponse response) {
        String sessionId = request.getHeader(SESSION_HEADER);
        if (sessionId == null || sessionId.isBlank()) {
            // Workbench iframes cannot set X-DW-Session-Id on navigation GETs.
            sessionId = resolveCommunityPluginUiSession(request, response);
        }
        if (sessionId == null || sessionId.isBlank()) {
            return false;
        }
        Optional<SessionEntity> session = sessionStore.authenticate(sessionId.trim());
        if (session.isEmpty()) {
            return false;
        }
        SessionEntity entity = session.get();
        UserContext.set(
                entity.getUserId(),
                entity.isGuest(),
                entity.getId(),
                entity.getTenantId()
        );
        return true;
    }

    /**
     * Community plugin UI assets ({@code GET/HEAD …/ui/**}) — the only requests
     * allowed through unauthenticated (see the anonymous branch in {@link #doFilterInternal}).
     */
    static boolean isCommunityPluginUiAssetRequest(HttpServletRequest request) {
        if (request == null) {
            return false;
        }
        String method = request.getMethod();
        if (!"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method)) {
            return false;
        }
        String path = request.getRequestURI();
        if (path == null || !path.contains("/api/community-plugins/")) {
            return false;
        }
        String pluginId = CommunityPluginUiTicketService.extractPluginIdFromUiPath(path);
        if (pluginId == null) {
            return false;
        }
        // A real plugin id matches the manifest id grammar; coincidence paths like
        // "/package/assets/ui/…" extract ids containing "/" and must not match.
        if (!pluginId.matches("[a-z0-9]+([.\\-][a-z0-9]+)*")) {
            return false;
        }
        // Exact ui prefix only — coincidence paths like
        // "/api/community-plugins/{id}/package/assets/ui/…" must not match.
        return path.startsWith("/api/community-plugins/" + pluginId + "/ui/");
    }

    /**
     * Community plugin UI assets ({@code GET …/ui/**}): prefer short-lived {@code dwUiTicket}
     * / path-scoped cookie grant; {@code ?dwSession=} remains as a deprecated fallback.
     */
    String resolveCommunityPluginUiSession(HttpServletRequest request, HttpServletResponse response) {
        if (request == null) {
            return null;
        }
        String method = request.getMethod();
        if (!"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method)) {
            return null;
        }
        String path = request.getRequestURI();
        if (path == null || !path.contains("/api/community-plugins/") || !path.contains("/ui/")) {
            return null;
        }
        String pluginId = CommunityPluginUiTicketService.extractPluginIdFromUiPath(path);
        if (pluginId == null) {
            return null;
        }

        if (uiTicketService != null) {
            String grant = cookieValue(request, CommunityPluginUiTicketService.COOKIE_NAME);
            Optional<String> fromGrant = uiTicketService.resolveGrant(grant, pluginId);
            if (fromGrant.isPresent()) {
                return fromGrant.get();
            }

            String ticket = request.getParameter(CommunityPluginUiTicketService.QUERY_TICKET);
            Optional<String> fromTicket = uiTicketService.resolveTicket(ticket, pluginId);
            if (fromTicket.isPresent()) {
                String sessionId = fromTicket.get();
                attachUiGrantCookie(response, request, pluginId, sessionId);
                return sessionId;
            }
        }

        String sessionId = request.getParameter(WebSocketSessionAuthSupport.QUERY_SESSION);
        if (sessionId != null && !sessionId.isBlank()) {
            log.warn(
                    "Deprecated community-plugin UI auth via ?{}= — prefer ?{}= (path={})",
                    WebSocketSessionAuthSupport.QUERY_SESSION,
                    CommunityPluginUiTicketService.QUERY_TICKET,
                    path
            );
            return sessionId.trim();
        }
        return null;
    }

    /** Package-visible for tests that call the legacy static helper name. */
    static String resolveCommunityPluginUiSessionQuery(HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        String method = request.getMethod();
        if (!"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method)) {
            return null;
        }
        String path = request.getRequestURI();
        if (path == null || !path.contains("/api/community-plugins/") || !path.contains("/ui/")) {
            return null;
        }
        String sessionId = request.getParameter(WebSocketSessionAuthSupport.QUERY_SESSION);
        if (sessionId == null || sessionId.isBlank()) {
            return null;
        }
        return sessionId.trim();
    }

    private void attachUiGrantCookie(
            HttpServletResponse response,
            HttpServletRequest request,
            String pluginId,
            String sessionId
    ) {
        if (uiTicketService == null || response == null) {
            return;
        }
        String grant = uiTicketService.mintGrant(sessionId, pluginId);
        boolean secure = request.isSecure()
                || "https".equalsIgnoreCase(request.getHeader("X-Forwarded-Proto"));
        ResponseCookie cookie = ResponseCookie.from(CommunityPluginUiTicketService.COOKIE_NAME, grant)
                .httpOnly(true)
                .secure(secure)
                .path(CommunityPluginUiTicketService.cookiePathForPlugin(pluginId))
                .maxAge(Duration.ofMillis(CommunityPluginUiTicketService.GRANT_TTL_MS))
                .sameSite("Lax")
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private static String cookieValue(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (cookie != null && name.equals(cookie.getName())) {
                String value = cookie.getValue();
                return value != null && !value.isBlank() ? value.trim() : null;
            }
        }
        return null;
    }

    private boolean authenticateApiToken(HttpServletRequest request) {
        String rawToken = resolveApiToken(request);
        if (rawToken == null) {
            return false;
        }
        Optional<ApiTokenEntity> token = apiTokenService.authenticate(rawToken);
        if (token.isEmpty()) {
            return false;
        }
        ApiTokenEntity entity = token.get();
        UserContext.setApiToken(
                entity.getUserId(),
                entity.getId(),
                normalizeScopes(entity.getScopes()),
                entity.getTenantId()
        );
        return true;
    }

    static String resolveApiToken(HttpServletRequest request) {
        String headerToken = request.getHeader(API_TOKEN_HEADER);
        if (headerToken != null && !headerToken.isBlank()) {
            return headerToken.trim();
        }
        String authorization = request.getHeader(AUTHORIZATION_HEADER);
        if (authorization != null && authorization.regionMatches(true, 0, BEARER_PREFIX, 0, BEARER_PREFIX.length())) {
            String bearer = authorization.substring(BEARER_PREFIX.length()).trim();
            if (!bearer.isBlank()) {
                return bearer;
            }
        }
        return null;
    }

    String resolveAllowedCorsOrigin(String origin) {
        return corsOriginAllowlist.resolveAllowedOrigin(origin);
    }

    private static Set<String> normalizeScopes(java.util.List<String> scopes) {
        if (scopes == null || scopes.isEmpty()) {
            return Set.of();
        }
        Set<String> normalized = new LinkedHashSet<>();
        for (String scope : scopes) {
            if (scope != null && !scope.isBlank()) {
                normalized.add(scope.trim());
            }
        }
        return Set.copyOf(normalized);
    }

    private void writeUnauthorized(HttpServletRequest request, HttpServletResponse response) throws IOException {
        applyCorsHeadersForUnauthorized(request, response);
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(
                "{\"code\":-1,\"msg\":\"" + UnauthorizedException.CODE + "\",\"data\":{\"errorCode\":\""
                        + UnauthorizedException.CODE + "\"}}"
        );
    }

    private void writeForbiddenHost(HttpServletRequest request, HttpServletResponse response) throws IOException {
        applyCorsHeadersForUnauthorized(request, response);
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(
                "{\"code\":-1,\"msg\":\"FORBIDDEN_HOST\",\"data\":{\"errorCode\":\"FORBIDDEN_HOST\"}}"
        );
    }

    private void applyCorsHeadersForUnauthorized(HttpServletRequest request, HttpServletResponse response) {
        String allowedOrigin = resolveAllowedCorsOrigin(request.getHeader(HttpHeaders.ORIGIN));
        if (allowedOrigin == null) {
            return;
        }
        response.setHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, allowedOrigin);
        response.setHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true");
        response.setHeader(HttpHeaders.VARY, HttpHeaders.ORIGIN);
        String requestHeaders = request.getHeader(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS);
        if (requestHeaders != null && !requestHeaders.isBlank()) {
            response.setHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS, requestHeaders);
        } else {
            response.setHeader(
                    HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS,
                    "Content-Type, " + SESSION_HEADER + ", " + API_TOKEN_HEADER + ", " + AUTHORIZATION_HEADER
            );
        }
    }
}
