package org.apache.datawise.backend.controller.system;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.domain.TerminalExecRequest;
import org.apache.datawise.backend.domain.TerminalExecResult;
import org.apache.datawise.backend.domain.TerminalStatusDto;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.security.RequiresFeature;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.TerminalService;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Web demo terminal HTTP API. Desktop JCEF uses WebSocket PTY ({@code /ws/terminal}).
 */
@RestController
@RequestMapping("/api/terminal")
@RequiresFeature(UserFeaturePermission.UTIL_TERMINAL)
public class TerminalController {

    private final TerminalService terminalService;
    private final UserAccessPolicy userAccessPolicy;

    public TerminalController(
            TerminalService terminalService,
            UserAccessPolicy userAccessPolicy
    ) {
        this.terminalService = terminalService;
        this.userAccessPolicy = userAccessPolicy;
    }

    @PostMapping("/execute")
    public ApiResponse<TerminalExecResult> executeTerminal(@RequestBody TerminalExecRequest request) {
        requireRegisteredAuth();
        return ApiResponse.ok(terminalService.execute(request.input(), request.cwd(), request.platform()));
    }

    @GetMapping("/welcome")
    public ApiResponse<String> terminalWelcome(@RequestParam(required = false) String platform) {
        requireRegisteredAuth();
        return ApiResponse.ok(terminalService.welcome(platform));
    }

    @GetMapping("/status")
    public ApiResponse<TerminalStatusDto> terminalStatus() {
        requireRegisteredAuth();
        return ApiResponse.ok(terminalService.status());
    }

    private void requireRegisteredAuth() {
        if (UserContext.getUserId() == null) {
            throw new UnauthorizedException();
        }
        userAccessPolicy.requireRegisteredUser();
    }
}
