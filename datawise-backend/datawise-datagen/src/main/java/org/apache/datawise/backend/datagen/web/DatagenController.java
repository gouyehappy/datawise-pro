package org.apache.datawise.backend.datagen.web;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.datagen.DatagenPreviewRequest;
import org.apache.datawise.backend.datagen.DatagenPreviewResult;
import org.apache.datawise.backend.datagen.DatagenService;
import org.apache.datawise.backend.database.sql.SqlService;
import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.pack.PackEntitlementChecker;
import org.apache.datawise.backend.domain.pack.PackIds;
import org.apache.datawise.backend.security.HeadlessSqlAuth;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/datagen")
public class DatagenController {

    private final DatagenService datagenService;
    private final SqlService sqlService;
    private final PackEntitlementChecker packEntitlementChecker;

    public DatagenController(
            DatagenService datagenService,
            SqlService sqlService,
            PackEntitlementChecker packEntitlementChecker
    ) {
        this.datagenService = datagenService;
        this.sqlService = sqlService;
        this.packEntitlementChecker = packEntitlementChecker;
    }

    @PostMapping("/table/preview")
    public ApiResponse<DatagenPreviewResult> preview(@RequestBody DatagenPreviewRequest request) {
        HeadlessSqlAuth.requireSqlAccess();
        packEntitlementChecker.requirePack(PackIds.DATAGEN);
        return ApiResponse.ok(datagenService.preview(request));
    }

    @PostMapping("/table/execute")
    public ApiResponse<ExecuteSqlResult> execute(@RequestBody DatagenPreviewRequest request) {
        HeadlessSqlAuth.requireSqlAccess();
        packEntitlementChecker.requirePack(PackIds.DATAGEN);
        DatagenPreviewResult preview = datagenService.preview(request);
        String sql = preview.insertSql();
        ExecuteSqlRequest executeRequest = new ExecuteSqlRequest(
                sql,
                preview.connectionId(),
                preview.database(),
                null,
                null,
                null,
                null,
                "datagen"
        );
        return ApiResponse.ok(sqlService.execute(executeRequest));
    }
}
