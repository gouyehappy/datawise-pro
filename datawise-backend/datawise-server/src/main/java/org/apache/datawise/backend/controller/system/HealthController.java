package org.apache.datawise.backend.controller.system;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.LegacyConfigPathMigrationService;
import org.apache.datawise.backend.domain.DeploymentProfileDto;
import org.apache.datawise.backend.domain.HealthStatusDto;
import org.apache.datawise.backend.domain.LegacyConfigMigrationStatusDto;
import org.apache.datawise.backend.domain.SystemMetricsDto;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.server.deployment.DeploymentProfileService;
import org.apache.datawise.backend.server.metrics.SystemMetricsService;
import org.apache.datawise.backend.service.InstanceWorkspaceService;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.apache.datawise.backend.security.HeadlessMigrationAuth;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequestMapping("/api")
public class HealthController {

    private final InstanceWorkspaceService instanceWorkspaceService;
    private final SystemMetricsService systemMetricsService;
    private final DeploymentProfileService deploymentProfileService;
    private final ConfigDirectoryService configDirectoryService;
    private final UserAccessPolicy userAccessPolicy;
    private final UserAdminPolicy userAdminPolicy;
    private final LegacyConfigPathMigrationService legacyConfigPathMigrationService;

    public HealthController(
            InstanceWorkspaceService instanceWorkspaceService,
            SystemMetricsService systemMetricsService,
            DeploymentProfileService deploymentProfileService,
            ConfigDirectoryService configDirectoryService,
            UserAccessPolicy userAccessPolicy,
            UserAdminPolicy userAdminPolicy,
            LegacyConfigPathMigrationService legacyConfigPathMigrationService
    ) {
        this.instanceWorkspaceService = instanceWorkspaceService;
        this.systemMetricsService = systemMetricsService;
        this.deploymentProfileService = deploymentProfileService;
        this.configDirectoryService = configDirectoryService;
        this.userAccessPolicy = userAccessPolicy;
        this.userAdminPolicy = userAdminPolicy;
        this.legacyConfigPathMigrationService = legacyConfigPathMigrationService;
    }

    @GetMapping("/health")
    public ApiResponse<HealthStatusDto> health() {
        String now = Instant.now().toString();
        // configDir 对设置页「当前实际读取」必需，匿名/访客也返回（非敏感路径）
        String configDir = configDirectoryService.getRoot().toString();
        if (UserContext.getUserId() == null || UserContext.isGuest()) {
            return ApiResponse.ok(new HealthStatusDto("ok", "1.0.0", now, null, configDir));
        }
        return ApiResponse.ok(new HealthStatusDto(
                "ok",
                "1.0.0",
                now,
                instanceWorkspaceService.scriptsRoot(),
                configDir
        ));
    }

    @GetMapping("/system/metrics")
    public ApiResponse<SystemMetricsDto> systemMetrics() {
        if (UserContext.getUserId() == null) {
            throw new UnauthorizedException();
        }
        userAccessPolicy.requireRegisteredUser();
        return ApiResponse.ok(systemMetricsService.collect());
    }

    @GetMapping("/system/deployment-profile")
    public ApiResponse<DeploymentProfileDto> deploymentProfile() {
        if (UserContext.getUserId() == null) {
            throw new UnauthorizedException();
        }
        userAccessPolicy.requireRegisteredUser();
        return ApiResponse.ok(deploymentProfileService.collect());
    }

    @GetMapping("/system/config-migration")
    public ApiResponse<LegacyConfigMigrationStatusDto> configMigrationStatus() {
        if (UserContext.getUserId() == null) {
            throw new UnauthorizedException();
        }
        userAccessPolicy.requireRegisteredUser();
        return ApiResponse.ok(legacyConfigPathMigrationService.scan());
    }

    @PostMapping("/system/config-migration/apply")
    public ApiResponse<LegacyConfigMigrationStatusDto> applyConfigMigration() {
        HeadlessMigrationAuth.requireConfigLayoutMigrationAccess(userAdminPolicy);
        return ApiResponse.ok(legacyConfigPathMigrationService.apply());
    }
}
