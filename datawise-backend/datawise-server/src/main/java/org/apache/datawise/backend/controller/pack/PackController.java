package org.apache.datawise.backend.controller.pack;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.pack.ActivateLicenseRequest;
import org.apache.datawise.backend.domain.pack.EntitlementSnapshotDto;
import org.apache.datawise.backend.domain.pack.InstallDpkRequest;
import org.apache.datawise.backend.domain.pack.InstallPackRequest;
import org.apache.datawise.backend.domain.pack.PackAuditDocument;
import org.apache.datawise.backend.domain.pack.StartTrialRequest;
import org.apache.datawise.backend.server.pack.EntitlementService;
import org.apache.datawise.backend.server.pack.PackAuditService;
import org.apache.datawise.backend.server.pack.PackInstallerService;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/packs")
public class PackController {

    private final EntitlementService entitlementService;
    private final PackAuditService packAuditService;
    private final PackInstallerService packInstallerService;
    private final UserAdminPolicy userAdminPolicy;

    public PackController(
            EntitlementService entitlementService,
            PackAuditService packAuditService,
            PackInstallerService packInstallerService,
            UserAdminPolicy userAdminPolicy
    ) {
        this.entitlementService = entitlementService;
        this.packAuditService = packAuditService;
        this.packInstallerService = packInstallerService;
        this.userAdminPolicy = userAdminPolicy;
    }

    @GetMapping("/entitlement")
    public ApiResponse<EntitlementSnapshotDto> entitlement() {
        return ApiResponse.ok(entitlementService.currentSnapshot());
    }

    @GetMapping("/catalog")
    public ApiResponse<EntitlementSnapshotDto> catalog() {
        return ApiResponse.ok(entitlementService.currentSnapshot());
    }

    @GetMapping("/audit")
    public ApiResponse<List<PackAuditDocument.PackAuditEvent>> audit(
            @RequestParam(defaultValue = "100") int limit
    ) {
        userAdminPolicy.requireAdminUser();
        return ApiResponse.ok(packAuditService.listRecent(limit));
    }

    @PostMapping("/entitlement/activate")
    public ApiResponse<EntitlementSnapshotDto> activate(@RequestBody ActivateLicenseRequest request) {
        userAdminPolicy.requireAdminUser();
        String key = request != null ? request.licenseKey() : null;
        return ApiResponse.ok(entitlementService.activateLicense(key));
    }

    @PostMapping("/entitlement/trial")
    public ApiResponse<EntitlementSnapshotDto> startTrial(@RequestBody StartTrialRequest request) {
        userAdminPolicy.requireAdminUser();
        String packId = request != null ? request.packId() : null;
        return ApiResponse.ok(entitlementService.startTrial(packId));
    }

    @PostMapping("/entitlement/trial/site-pro")
    public ApiResponse<EntitlementSnapshotDto> claimSiteProTrial() {
        userAdminPolicy.requireAdminUser();
        return ApiResponse.ok(entitlementService.claimSiteProTrial());
    }

    @PostMapping("/install")
    public ApiResponse<EntitlementSnapshotDto> install(@RequestBody InstallPackRequest request) {
        userAdminPolicy.requireAdminUser();
        String packId = request != null ? request.packId() : null;
        String version = request != null ? request.version() : null;
        return ApiResponse.ok(entitlementService.installPack(packId, version));
    }

    @PostMapping("/install-dpk")
    public ApiResponse<EntitlementSnapshotDto> installDpk(@RequestBody InstallDpkRequest request) {
        userAdminPolicy.requireAdminUser();
        String path = request != null ? request.path() : null;
        return ApiResponse.ok(packInstallerService.installFromPath(path));
    }

    @DeleteMapping("/{packId}")
    public ApiResponse<EntitlementSnapshotDto> uninstall(@PathVariable String packId) {
        userAdminPolicy.requireAdminUser();
        return ApiResponse.ok(entitlementService.uninstallPack(packId));
    }
}
