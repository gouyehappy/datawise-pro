package org.apache.datawise.backend.controller.system;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.database.connection.RuntimeOverviewService;
import org.apache.datawise.backend.domain.RuntimeOfflineImportRequest;
import org.apache.datawise.backend.domain.RuntimeOfflineImportResultDto;
import org.apache.datawise.backend.domain.RuntimeOverviewDto;
import org.apache.datawise.backend.security.HeadlessRuntimeAuth;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.server.runtime.RuntimeOfflineImportService;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/runtime")
public class RuntimeController {

    private final RuntimeOverviewService runtimeOverviewService;
    private final RuntimeOfflineImportService runtimeOfflineImportService;
    private final UserAccessPolicy userAccessPolicy;
    private final UserAdminPolicy userAdminPolicy;

    public RuntimeController(
            RuntimeOverviewService runtimeOverviewService,
            RuntimeOfflineImportService runtimeOfflineImportService,
            UserAccessPolicy userAccessPolicy,
            UserAdminPolicy userAdminPolicy
    ) {
        this.runtimeOverviewService = runtimeOverviewService;
        this.runtimeOfflineImportService = runtimeOfflineImportService;
        this.userAccessPolicy = userAccessPolicy;
        this.userAdminPolicy = userAdminPolicy;
    }

    @GetMapping
    public ApiResponse<RuntimeOverviewDto> overview() {
        if (UserContext.getUserId() == null) {
            throw new UnauthorizedException();
        }
        userAccessPolicy.requireRegisteredUser();
        return ApiResponse.ok(runtimeOverviewService.overview());
    }

    @GetMapping("/jre")
    public ApiResponse<RuntimeOverviewDto.RuntimeJreDto> jre() {
        if (UserContext.getUserId() == null) {
            throw new UnauthorizedException();
        }
        userAccessPolicy.requireRegisteredUser();
        return ApiResponse.ok(runtimeOverviewService.overview().jre());
    }

    /**
     * Offline zip import from a <em>local filesystem path</em> on the server host.
     * Requires tenant admin session or API token with {@code runtime} scope.
     * Layout: {@code plugins/*.jar} / {@code connectors/*.jar} → plugins;
     * {@code drivers/*.jar} → drivers; optional {@code runtime-catalog.json}.
     */
    @PostMapping("/import")
    public ApiResponse<RuntimeOfflineImportResultDto> importOffline(
            @RequestBody RuntimeOfflineImportRequest request
    ) {
        HeadlessRuntimeAuth.requireRuntimeManageAccess(userAdminPolicy);
        String path = request != null ? request.path() : null;
        return ApiResponse.ok(runtimeOfflineImportService.importFromPath(path));
    }
}
