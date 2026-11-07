package org.apache.datawise.backend.controller.workspace;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.AppendSqlLogRequest;
import org.apache.datawise.backend.domain.SaveConsoleRequest;
import org.apache.datawise.backend.domain.SavedConsoleDto;
import org.apache.datawise.backend.domain.SqlExecutionStatsDto;
import org.apache.datawise.backend.domain.SqlLogDto;
import org.apache.datawise.backend.service.WorkspaceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/workspace")
public class WorkspaceSqlController {

    private final WorkspaceService workspaceService;

    public WorkspaceSqlController(WorkspaceService workspaceService) {
        this.workspaceService = workspaceService;
    }

    @GetMapping("/sql-logs")
    public ApiResponse<List<SqlLogDto>> listSqlLogs() {
        return ApiResponse.ok(workspaceService.listSqlLogs());
    }

    @GetMapping("/sql-stats")
    public ApiResponse<SqlExecutionStatsDto> getSqlExecutionStats(
            @RequestParam(required = false) String connectionId,
            @RequestParam(defaultValue = "7") int days,
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(defaultValue = "3000") long slowThresholdMs
    ) {
        return ApiResponse.ok(workspaceService.getSqlExecutionStats(
                connectionId,
                days,
                limit,
                slowThresholdMs
        ));
    }

    @PostMapping("/sql-logs")
    public ApiResponse<SqlLogDto> appendSqlLog(@RequestBody AppendSqlLogRequest request) {
        return ApiResponse.ok(workspaceService.appendSqlLog(request));
    }

    @GetMapping("/saved-consoles")
    public ApiResponse<List<SavedConsoleDto>> listSavedConsoles() {
        return ApiResponse.ok(workspaceService.listSavedConsoles());
    }

    @PostMapping("/saved-consoles")
    public ApiResponse<SavedConsoleDto> saveConsole(@RequestBody SaveConsoleRequest request) {
        return ApiResponse.ok(workspaceService.saveConsole(request));
    }
}
