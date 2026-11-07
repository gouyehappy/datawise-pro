package org.apache.datawise.backend.controller.system;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.ConnectionConfig;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.database.connection.ConnectionTestService;
import org.apache.datawise.backend.server.pack.EntitlementService;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/connections")
public class ConnectionTestController {

    private final ConnectionTestService connectionTestService;
    private final UserResourcePolicy resourcePolicy;
    private final EntitlementService entitlementService;

    public ConnectionTestController(
            ConnectionTestService connectionTestService,
            UserResourcePolicy resourcePolicy,
            EntitlementService entitlementService
    ) {
        this.connectionTestService = connectionTestService;
        this.resourcePolicy = resourcePolicy;
        this.entitlementService = entitlementService;
    }

    @PostMapping("/test")
    public ApiResponse<ConnectionTestResult> testConnection(@RequestBody ConnectionConfig config) {
        // 访客可在会话临时 catalog 中新建连接，测试探针不应要求注册用户。
        resourcePolicy.requireSessionIdFor(UserResource.CONNECTION_CATALOG);
        if (config != null) {
            entitlementService.requireConnector(config.getDbType());
        }
        return ApiResponse.ok(connectionTestService.test(config));
    }
}
