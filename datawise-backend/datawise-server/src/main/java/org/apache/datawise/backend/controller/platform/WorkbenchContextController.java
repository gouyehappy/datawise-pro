package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.platform.workbenchcontext.WorkbenchContextSnapshot;
import org.apache.datawise.backend.platform.workbenchcontext.WorkbenchContextStore;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Live workbench focus publish/read for MCP and in-app AI.
 */
@RestController
@RequestMapping("/api/platform/workbench-context")
public class WorkbenchContextController {

    private final WorkbenchContextStore store;

    public WorkbenchContextController(WorkbenchContextStore store) {
        this.store = store;
    }

    @GetMapping
    public ApiResponse<WorkbenchContextSnapshot> get(
            @RequestParam(required = false, defaultValue = "true") boolean includeBodyPreview
    ) {
        long userId = UserContext.requireUserId();
        String tenantId = UserContext.getTenantId();
        return ApiResponse.ok(store.get(userId, tenantId, includeBodyPreview));
    }

    @PutMapping
    public ApiResponse<Void> put(@RequestBody WorkbenchContextSnapshot snapshot) {
        long userId = UserContext.requireUserId();
        String tenantId = UserContext.getTenantId();
        store.put(userId, tenantId, snapshot);
        return ApiResponse.ok(null);
    }

    @PostMapping("/heartbeat")
    public ApiResponse<Void> heartbeat() {
        long userId = UserContext.requireUserId();
        String tenantId = UserContext.getTenantId();
        store.heartbeat(userId, tenantId);
        return ApiResponse.ok(null);
    }
}
