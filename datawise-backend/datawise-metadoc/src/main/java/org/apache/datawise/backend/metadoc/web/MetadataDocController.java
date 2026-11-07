package org.apache.datawise.backend.metadoc.web;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.pack.PackEntitlementChecker;
import org.apache.datawise.backend.metadoc.MetadataDocExportResult;
import org.apache.datawise.backend.metadoc.MetadataDocPreviewResult;
import org.apache.datawise.backend.metadoc.MetadataDocService;
import org.apache.datawise.backend.security.HeadlessSqlAuth;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api")
public class MetadataDocController {

    private final MetadataDocService metadataDocService;
    private final PackEntitlementChecker packEntitlementChecker;

    public MetadataDocController(
            MetadataDocService metadataDocService,
            PackEntitlementChecker packEntitlementChecker
    ) {
        this.metadataDocService = metadataDocService;
        this.packEntitlementChecker = packEntitlementChecker;
    }

    /**
     * 导出数据库元数据文档（Markdown/HTML）。
     * <p>
     * 示例：GET /api/export-metadoc/database?connectionId=...&database=...&format=md&includeDetails=true
     */
    @GetMapping("/export-metadoc/database")
    public ResponseEntity<byte[]> exportDatabaseMetadoc(
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String database,
            @RequestParam(defaultValue = "md") String format,
            @RequestParam(defaultValue = "true") boolean includeDetails
    ) {
        packEntitlementChecker.requireMetaDoc();
        HeadlessSqlAuth.requireSqlAccess();
        MetadataDocExportResult result = metadataDocService.exportDatabase(
                connectionId,
                database,
                format,
                includeDetails
        );
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.CONTENT_TYPE, result.contentType());
        headers.add(HttpHeaders.CONTENT_DISPOSITION, contentDisposition(result.filename()));
        return ResponseEntity.ok()
                .headers(headers)
                .body(result.data());
    }

    @GetMapping("/export-metadoc/database/preview")
    public ApiResponse<MetadataDocPreviewResult> previewDatabaseMetadoc(
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String database,
            @RequestParam(defaultValue = "md") String format,
            @RequestParam(defaultValue = "true") boolean includeDetails
    ) {
        packEntitlementChecker.requireMetaDoc();
        HeadlessSqlAuth.requireSqlAccess();
        return ApiResponse.ok(metadataDocService.previewDatabase(
                connectionId,
                database,
                format,
                includeDetails
        ));
    }

    @SuppressWarnings("unused")
    @GetMapping("/export-metadoc/ping")
    public ApiResponse<String> ping() {
        return ApiResponse.ok("ok");
    }

    private static String contentDisposition(String filename) {
        String safe = filename == null || filename.isBlank() ? "metadoc.md" : filename.trim();
        // RFC 5987
        String encoded = java.net.URLEncoder.encode(safe, StandardCharsets.UTF_8);
        return "attachment; filename*=UTF-8''" + encoded;
    }
}
