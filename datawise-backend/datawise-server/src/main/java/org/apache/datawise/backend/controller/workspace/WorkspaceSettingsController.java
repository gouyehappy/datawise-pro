package org.apache.datawise.backend.controller.workspace;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.WorkspaceSettingsDto;
import org.apache.datawise.backend.service.WorkspaceScriptsRootService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workspace")
public class WorkspaceSettingsController {

    private final WorkspaceScriptsRootService workspaceScriptsRootService;

    public WorkspaceSettingsController(WorkspaceScriptsRootService workspaceScriptsRootService) {
        this.workspaceScriptsRootService = workspaceScriptsRootService;
    }

    @GetMapping("/settings")
    public ApiResponse<WorkspaceSettingsDto> getWorkspaceSettings() {
        return ApiResponse.ok(workspaceScriptsRootService.getSettings());
    }
}
