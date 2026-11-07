package org.apache.datawise.backend.ai.web;

import org.apache.datawise.backend.ai.canvas.AnalysisCanvasService;
import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.common.pack.AiAccessGate;
import org.apache.datawise.backend.domain.AiMeterCapabilities;
import org.apache.datawise.backend.domain.AnalysisCanvasDetailDto;
import org.apache.datawise.backend.domain.AnalysisCanvasSummaryDto;
import org.apache.datawise.backend.domain.RerunAnalysisCanvasRequest;
import org.apache.datawise.backend.domain.SaveAnalysisCanvasRequest;
import org.apache.datawise.backend.service.tenant.TenantQuotaService;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/platform/analysis-canvas")
@Profile("!without-ai")
public class AnalysisCanvasController {

    private final AnalysisCanvasService canvasService;
    private final AiAccessGate aiAccessGate;
    private final TenantQuotaService tenantQuotaService;

    public AnalysisCanvasController(
            AnalysisCanvasService canvasService,
            AiAccessGate aiAccessGate,
            TenantQuotaService tenantQuotaService
    ) {
        this.canvasService = canvasService;
        this.aiAccessGate = aiAccessGate;
        this.tenantQuotaService = tenantQuotaService;
    }

    @GetMapping
    public ApiResponse<List<AnalysisCanvasSummaryDto>> list() {
        aiAccessGate.requireAiPack();
        return ApiResponse.ok(canvasService.list());
    }

    @GetMapping("/{id}")
    public ApiResponse<AnalysisCanvasDetailDto> get(@PathVariable String id) {
        aiAccessGate.requireAiPack();
        return ApiResponse.ok(canvasService.get(id));
    }

    @PutMapping
    public ApiResponse<AnalysisCanvasDetailDto> save(@RequestBody SaveAnalysisCanvasRequest request) {
        aiAccessGate.requireAiPack();
        return ApiResponse.ok(canvasService.save(request));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable String id) {
        aiAccessGate.requireAiPack();
        canvasService.delete(id);
        return ApiResponse.ok(null);
    }

    @PostMapping("/rerun")
    public ApiResponse<AnalysisCanvasService.RerunAnalysisCanvasResult> rerun(
            @RequestBody RerunAnalysisCanvasRequest request
    ) {
        aiAccessGate.requireAiPack();
        tenantQuotaService.requireAiCallQuota(AiMeterCapabilities.CANVAS_RERUN);
        return ApiResponse.ok(canvasService.rerun(request));
    }
}
