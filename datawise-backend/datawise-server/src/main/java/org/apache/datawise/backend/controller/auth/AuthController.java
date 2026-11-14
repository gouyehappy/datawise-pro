package org.apache.datawise.backend.controller.auth;

import jakarta.servlet.http.HttpServletResponse;
import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.AuthLoginOptionsDto;
import org.apache.datawise.backend.domain.AuthSessionPolicyDto;
import org.apache.datawise.backend.domain.ChangePasswordRequest;
import org.apache.datawise.backend.domain.LoginResult;
import org.apache.datawise.backend.domain.OidcConfigDto;
import org.apache.datawise.backend.domain.RegisterRequest;
import org.apache.datawise.backend.domain.SaveOidcConfigRequest;
import org.apache.datawise.backend.domain.SessionInfo;
import org.apache.datawise.backend.domain.SwitchTenantRequest;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.domain.VerifyPasswordRequest;
import org.apache.datawise.backend.security.RequiresFeature;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.AuthService;
import org.apache.datawise.backend.service.WriteUnlockService;
import org.apache.datawise.backend.service.auth.OidcAuthService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@RestController
public class AuthController {

    private final AuthService authService;
    private final OidcAuthService oidcAuthService;
    private final WriteUnlockService writeUnlockService;

    public AuthController(
            AuthService authService,
            OidcAuthService oidcAuthService,
            WriteUnlockService writeUnlockService) {
        this.authService = authService;
        this.oidcAuthService = oidcAuthService;
        this.writeUnlockService = writeUnlockService;
    }

    @PostMapping("/login")
    public ApiResponse<LoginResult> login(
            @RequestParam String userName,
            @RequestParam String userPassword
    ) {
        return ApiResponse.ok(authService.login(userName, userPassword));
    }

    @PostMapping("/login/guest")
    public ApiResponse<LoginResult> loginGuest() {
        return ApiResponse.ok(authService.loginAsGuest());
    }

    @PostMapping("/api/auth/register")
    public ApiResponse<LoginResult> register(@RequestBody RegisterRequest request) {
        return ApiResponse.ok(authService.register(request));
    }

    @GetMapping("/api/auth/login-options")
    public ApiResponse<AuthLoginOptionsDto> loginOptions() {
        return ApiResponse.ok(oidcAuthService.loginOptions());
    }

    @GetMapping("/api/auth/oidc/login")
    public void oidcLogin(HttpServletResponse response) throws IOException {
        String url = oidcAuthService.beginAuthorizationUrl();
        response.sendRedirect(url);
    }

    @GetMapping("/api/auth/oidc/callback")
    public void oidcCallback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error,
            HttpServletResponse response
    ) throws IOException {
        String base = oidcAuthService.frontendRedirectBase();
        if (error != null && !error.isBlank()) {
            response.sendRedirect(appendQuery(base, "oidcError", error));
            return;
        }
        try {
            LoginResult result = oidcAuthService.handleCallback(code, state);
            String redirect = appendQuery(base, "oidcSession", result.sessionId());
            redirect = appendQuery(redirect, "oidcUser", result.userName() != null ? result.userName() : "");
            response.sendRedirect(redirect);
        } catch (IllegalArgumentException ex) {
            response.sendRedirect(appendQuery(base, "oidcError", ex.getMessage() != null ? ex.getMessage() : "OIDC_FAILED"));
        }
    }

    @GetMapping("/api/auth/oidc/config")
    public ApiResponse<OidcConfigDto> oidcConfig() {
        return ApiResponse.ok(oidcAuthService.getConfigForAdmin());
    }

    @PutMapping("/api/auth/oidc/config")
    @RequiresFeature(UserFeaturePermission.SETTINGS_BASIC)
    public ApiResponse<OidcConfigDto> updateOidcConfig(@RequestBody SaveOidcConfigRequest request) {
        return ApiResponse.ok(oidcAuthService.saveConfig(request));
    }

    @GetMapping("/api/auth/session")
    public ApiResponse<SessionInfo> currentSession() {
        return ApiResponse.ok(authService.getCurrentSession());
    }

    @PostMapping("/api/auth/switch-tenant")
    public ApiResponse<SessionInfo> switchTenant(@RequestBody SwitchTenantRequest request) {
        return ApiResponse.ok(authService.switchTenant(request));
    }

    @GetMapping("/api/auth/session-policy")
    public ApiResponse<AuthSessionPolicyDto> sessionPolicy() {
        return ApiResponse.ok(authService.getSessionPolicy());
    }

    @PutMapping("/api/auth/session-policy")
    @RequiresFeature(UserFeaturePermission.SETTINGS_BASIC)
    public ApiResponse<AuthSessionPolicyDto> updateSessionPolicy(@RequestBody AuthSessionPolicyDto policy) {
        return ApiResponse.ok(authService.updateSessionPolicy(policy));
    }

    @PostMapping("/signOut")
    public ApiResponse<Void> signOut() {
        Long userId = UserContext.getUserId();
        if (userId != null) {
            writeUnlockService.clearAllForUser(userId);
        }
        authService.signOut();
        return ApiResponse.ok(null);
    }

    @PostMapping("/api/auth/change-password")
    public ApiResponse<Void> changePassword(@RequestBody ChangePasswordRequest request) {
        authService.changePassword(request.currentPassword(), request.newPassword());
        return ApiResponse.ok(null);
    }

    @PostMapping("/api/auth/verify-password")
    public ApiResponse<Void> verifyPassword(@RequestBody VerifyPasswordRequest request) {
        authService.verifyPassword(request.password());
        return ApiResponse.ok(null);
    }

    private static String appendQuery(String base, String key, String value) {
        String encoded = URLEncoder.encode(value != null ? value : "", StandardCharsets.UTF_8);
        String separator = base.contains("?") ? "&" : "?";
        return base + separator + key + "=" + encoded;
    }
}
