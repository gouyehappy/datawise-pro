package org.apache.datawise.backend.ai.web;

import org.apache.datawise.backend.ai.semantic.SemanticLayerService;
import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.common.pack.AiAccessGate;
import org.apache.datawise.backend.domain.AiMeterCapabilities;
import org.apache.datawise.backend.domain.AutoGenerateSemanticMetricsRequest;
import org.apache.datawise.backend.domain.SaveSemanticMetricRequest;
import org.apache.datawise.backend.domain.SemanticMetricDto;
import org.apache.datawise.backend.service.tenant.TenantQuotaService;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/platform/semantic-metrics")
@Profile("!without-ai")
public class SemanticLayerController {

    private final SemanticLayerService semanticLayerService;
    private final AiAccessGate aiAccessGate;
    private final TenantQuotaService tenantQuotaService;

    public SemanticLayerController(
            SemanticLayerService semanticLayerService,
            AiAccessGate aiAccessGate,
            TenantQuotaService tenantQuotaService
    ) {
        this.semanticLayerService = semanticLayerService;
        this.aiAccessGate = aiAccessGate;
        this.tenantQuotaService = tenantQuotaService;
    }

    @GetMapping
    public ApiResponse<List<SemanticMetricDto>> list(
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String database
    ) {
        aiAccessGate.requireAiPack();
        return ApiResponse.ok(semanticLayerService.list(connectionId, database));
    }

    @PutMapping
    public ApiResponse<SemanticMetricDto> save(@RequestBody SaveSemanticMetricRequest request) {
        aiAccessGate.requireAiPack();
        return ApiResponse.ok(semanticLayerService.save(request));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable String id) {
        aiAccessGate.requireAiPack();
        semanticLayerService.delete(id);
        return ApiResponse.ok(null);
    }

    @PostMapping("/auto-generate")
    public ApiResponse<List<SemanticMetricDto>> autoGenerate(
            @RequestBody AutoGenerateSemanticMetricsRequest request
    ) {
        aiAccessGate.requireAiPack();
        tenantQuotaService.requireAiCallQuota(AiMeterCapabilities.SEMANTIC_AUTO);
        return ApiResponse.ok(semanticLayerService.autoGenerate(request));
    }
}
