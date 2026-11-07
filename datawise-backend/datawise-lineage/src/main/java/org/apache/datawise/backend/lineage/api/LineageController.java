package org.apache.datawise.backend.lineage.api;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.LineageGraphDto;
import org.apache.datawise.backend.domain.LineageImpactDto;
import org.apache.datawise.backend.domain.ParseLineageRequest;
import org.apache.datawise.backend.domain.pack.PackEntitlementChecker;
import org.apache.datawise.backend.domain.pack.PackIds;
import org.apache.datawise.backend.lineage.service.LineageService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;

@RestController
@RequestMapping("/api/lineage/view-models")
public class LineageController {

    private final LineageService lineageService;
    private final ObjectProvider<PackEntitlementChecker> packEntitlementChecker;

    public LineageController(
            LineageService lineageService,
            ObjectProvider<PackEntitlementChecker> packEntitlementChecker
    ) {
        this.lineageService = lineageService;
        this.packEntitlementChecker = packEntitlementChecker;
    }

    @GetMapping
    public ApiResponse<LineageGraphDto> getLineage(
            @RequestParam String connectionId,
            @RequestParam String instanceName,
            @RequestParam String name,
            @RequestParam(defaultValue = "false") boolean forceRefresh
    ) throws IOException {
        requireLineagePack();
        return ApiResponse.ok(lineageService.getViewModelLineage(connectionId, instanceName, name, forceRefresh));
    }

    @GetMapping("/impact")
    public ApiResponse<LineageImpactDto> impact(
            @RequestParam String connectionId,
            @RequestParam String instanceName,
            @RequestParam String name
    ) throws IOException {
        requireLineagePack();
        return ApiResponse.ok(lineageService.findDownstreamImpact(connectionId, instanceName, name));
    }

    @PostMapping("/parse")
    public ApiResponse<LineageGraphDto> parse(@RequestBody ParseLineageRequest request) throws IOException {
        requireLineagePack();
        return ApiResponse.ok(lineageService.parseLineage(request));
    }

    private void requireLineagePack() {
        PackEntitlementChecker checker = packEntitlementChecker.getIfAvailable();
        if (checker != null) {
            checker.requirePack(PackIds.LINEAGE);
        }
    }
}
