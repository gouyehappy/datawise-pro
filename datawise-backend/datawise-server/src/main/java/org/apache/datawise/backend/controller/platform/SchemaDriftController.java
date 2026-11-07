package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.database.drift.SchemaDriftService;
import org.apache.datawise.backend.domain.SaveSchemaDriftMonitorRequest;
import org.apache.datawise.backend.domain.SchemaDriftCompareRequest;
import org.apache.datawise.backend.domain.SchemaDriftMonitorDto;
import org.apache.datawise.backend.domain.SchemaDriftReportDto;
import org.apache.datawise.backend.domain.pack.PackEntitlementChecker;
import org.apache.datawise.backend.domain.pack.PackIds;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import java.util.List;

@RestController
@RequestMapping("/api/platform/schema-drift")
public class SchemaDriftController {

    private final SchemaDriftService schemaDriftService;
    private final PackEntitlementChecker packEntitlementChecker;
    private final UserAdminPolicy userAdminPolicy;

    public SchemaDriftController(
            SchemaDriftService schemaDriftService,
            PackEntitlementChecker packEntitlementChecker,
            UserAdminPolicy userAdminPolicy
    ) {
        this.schemaDriftService = schemaDriftService;
        this.packEntitlementChecker = packEntitlementChecker;
        this.userAdminPolicy = userAdminPolicy;
    }

    @GetMapping("/monitors")
    public ApiResponse<List<SchemaDriftMonitorDto>> listMonitors() {
        requireGovernanceAdmin();
        return ApiResponse.ok(schemaDriftService.listMonitors());
    }

    @PutMapping("/monitors")
    public ApiResponse<SchemaDriftMonitorDto> saveMonitor(@Valid @RequestBody SaveSchemaDriftMonitorRequest request) {
        requireGovernanceAdmin();
        return ApiResponse.ok(schemaDriftService.saveMonitor(request));
    }

    @DeleteMapping("/monitors/{id}")
    public ApiResponse<Void> deleteMonitor(@PathVariable String id) {
        requireGovernanceAdmin();
        schemaDriftService.deleteMonitor(id);
        return ApiResponse.ok(null);
    }

    @PostMapping("/compare")
    public ApiResponse<SchemaDriftReportDto> compare(@RequestBody SchemaDriftCompareRequest request) {
        requireGovernanceAdmin();
        return ApiResponse.ok(schemaDriftService.compare(request));
    }

    @PostMapping("/monitors/{id}/run")
    public ApiResponse<SchemaDriftReportDto> runMonitor(@PathVariable String id) {
        requireGovernanceAdmin();
        return ApiResponse.ok(schemaDriftService.runMonitor(id));
    }

    private void requireGovernanceAdmin() {
        userAdminPolicy.requireAdminUser();
        packEntitlementChecker.requirePack(PackIds.GOVERNANCE);
    }
}
