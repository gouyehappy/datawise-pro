package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.platform.mcp.confirm.ConfirmGateService;
import org.apache.datawise.backend.platform.mcp.confirm.ConfirmTicket;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.security.RequiresFeature;

@RestController
@RequestMapping("/api/platform/mcp/confirmations")
@Profile("!without-ai")
@RequiresFeature(UserFeaturePermission.NAV_AI)
public class McpConfirmationController {

    private final ConfirmGateService confirmGateService;

    public McpConfirmationController(ConfirmGateService confirmGateService) {
        this.confirmGateService = confirmGateService;
    }

    @GetMapping
    public ApiResponse<List<ConfirmTicket>> listPending() {
        return ApiResponse.ok(confirmGateService.listPendingForCurrentUser());
    }

    @GetMapping("/{id}")
    public ApiResponse<ConfirmTicket> get(@PathVariable("id") String id) {
        return ApiResponse.ok(confirmGateService.getForCurrentUser(id));
    }

    public record DecideRequest(String decision, String note) {
    }

    @PostMapping("/{id}/decide")
    public ApiResponse<ConfirmTicket> decide(
            @PathVariable("id") String id,
            @RequestBody DecideRequest body
    ) {
        String decision = body != null ? body.decision() : null;
        String note = body != null ? body.note() : null;
        return ApiResponse.ok(confirmGateService.decide(id, decision, note));
    }
}
