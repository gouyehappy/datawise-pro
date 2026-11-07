package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.SqlReviewRequest;
import org.apache.datawise.backend.domain.SqlReviewResultDto;
import org.apache.datawise.backend.platform.sql.SqlReviewOrchestrator;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/platform/sql-review")
public class SqlReviewController {

    private final SqlReviewOrchestrator sqlReviewOrchestrator;

    public SqlReviewController(SqlReviewOrchestrator sqlReviewOrchestrator) {
        this.sqlReviewOrchestrator = sqlReviewOrchestrator;
    }

    @PostMapping
    public ApiResponse<SqlReviewResultDto> review(@RequestBody SqlReviewRequest request) {
        return ApiResponse.ok(sqlReviewOrchestrator.review(request));
    }
}
