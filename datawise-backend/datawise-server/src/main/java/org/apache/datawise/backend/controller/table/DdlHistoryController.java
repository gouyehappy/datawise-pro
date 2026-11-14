package org.apache.datawise.backend.controller.table;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.database.ddlhistory.DdlHistoryService;
import org.apache.datawise.backend.domain.DdlHistoryEntry;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.security.RequiresFeature;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** MetaForge B1：表级 DDL 执行历史。 */
@RestController
@RequestMapping("/api/ddl-history")
@RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_OPEN)
public class DdlHistoryController {

    private final DdlHistoryService ddlHistoryService;

    public DdlHistoryController(DdlHistoryService ddlHistoryService) {
        this.ddlHistoryService = ddlHistoryService;
    }

    @GetMapping
    public ApiResponse<List<DdlHistoryEntry>> list(
            @RequestParam String connectionId,
            @RequestParam(required = false) String database,
            @RequestParam(defaultValue = "50") int limit
    ) {
        return ApiResponse.ok(ddlHistoryService.list(connectionId, database, limit));
    }
}
