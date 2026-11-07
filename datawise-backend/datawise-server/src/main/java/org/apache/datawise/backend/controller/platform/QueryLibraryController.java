package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.QueryLibraryVersionDto;
import org.apache.datawise.backend.domain.SaveQueryLibraryVersionRequest;
import org.apache.datawise.backend.workspace.query.QueryLibraryVersionService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/platform/query-library")
public class QueryLibraryController {

    private final QueryLibraryVersionService queryLibraryVersionService;

    public QueryLibraryController(QueryLibraryVersionService queryLibraryVersionService) {
        this.queryLibraryVersionService = queryLibraryVersionService;
    }

    @GetMapping("/{teamId}/{queryId}/versions")
    public ApiResponse<List<QueryLibraryVersionDto>> listVersions(
            @PathVariable String teamId,
            @PathVariable String queryId
    ) {
        return ApiResponse.ok(queryLibraryVersionService.listVersions(teamId, queryId));
    }

    @PostMapping("/versions")
    public ApiResponse<QueryLibraryVersionDto> saveVersion(@RequestBody SaveQueryLibraryVersionRequest request) {
        return ApiResponse.ok(queryLibraryVersionService.saveVersion(request));
    }
}
