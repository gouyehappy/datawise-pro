package org.apache.datawise.backend.controller.workspace;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.CreateExportTaskRequest;
import org.apache.datawise.backend.domain.ExportTaskDto;
import org.apache.datawise.backend.service.WorkspaceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/workspace")
public class WorkspaceExportController {

    private final WorkspaceService workspaceService;

    public WorkspaceExportController(WorkspaceService workspaceService) {
        this.workspaceService = workspaceService;
    }

    @GetMapping("/export-tasks")
    public ApiResponse<List<ExportTaskDto>> listExportTasks() {
        return ApiResponse.ok(workspaceService.listExportTasks());
    }

    @PostMapping("/export-tasks")
    public ApiResponse<ExportTaskDto> createExportTask(@RequestBody CreateExportTaskRequest request) {
        return ApiResponse.ok(workspaceService.createExportTask(request));
    }
}
