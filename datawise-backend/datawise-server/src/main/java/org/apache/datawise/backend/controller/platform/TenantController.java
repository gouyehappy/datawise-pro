package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.CreateTenantRequest;
import org.apache.datawise.backend.domain.InviteTenantMemberRequest;
import org.apache.datawise.backend.domain.TenantAiUsageDto;
import org.apache.datawise.backend.domain.TenantMemberDto;
import org.apache.datawise.backend.domain.TenantSummaryDto;
import org.apache.datawise.backend.domain.UpdateTenantStatusRequest;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.tenant.TenantQuotaService;
import org.apache.datawise.backend.service.tenant.TenantService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/tenants")
public class TenantController {

    private final TenantService tenantService;
    private final TenantQuotaService tenantQuotaService;

    public TenantController(TenantService tenantService, TenantQuotaService tenantQuotaService) {
        this.tenantService = tenantService;
        this.tenantQuotaService = tenantQuotaService;
    }

    @GetMapping("/mine")
    public ApiResponse<List<TenantSummaryDto>> mine() {
        return ApiResponse.ok(tenantService.listMyTenants());
    }

    @GetMapping("/mine/ai-usage")
    public ApiResponse<TenantAiUsageDto> currentAiUsage() {
        UserContext.requireUserId();
        return ApiResponse.ok(tenantQuotaService.currentAiUsage());
    }

    @GetMapping
    public ApiResponse<List<TenantSummaryDto>> listAll() {
        return ApiResponse.ok(tenantService.listAllTenantsForPlatform());
    }

    @PostMapping
    public ApiResponse<TenantSummaryDto> create(@RequestBody CreateTenantRequest request) {
        return ApiResponse.ok(tenantService.createTenant(request));
    }

    @PutMapping("/{tenantId}/status")
    public ApiResponse<TenantSummaryDto> updateStatus(
            @PathVariable String tenantId,
            @RequestBody UpdateTenantStatusRequest request
    ) {
        return ApiResponse.ok(tenantService.updateStatus(tenantId, request));
    }

    @GetMapping("/{tenantId}/members")
    public ApiResponse<List<TenantMemberDto>> listMembers(@PathVariable String tenantId) {
        return ApiResponse.ok(tenantService.listMembers(tenantId));
    }

    @PostMapping("/{tenantId}/members")
    public ApiResponse<TenantSummaryDto> invite(
            @PathVariable String tenantId,
            @RequestBody InviteTenantMemberRequest request
    ) {
        return ApiResponse.ok(tenantService.inviteMember(tenantId, request));
    }

    @DeleteMapping("/{tenantId}/members/{userId}")
    public ApiResponse<Void> removeMember(
            @PathVariable String tenantId,
            @PathVariable long userId
    ) {
        tenantService.removeMember(tenantId, userId);
        return ApiResponse.ok(null);
    }
}
