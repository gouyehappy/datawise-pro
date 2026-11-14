package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.database.federated.FederatedJoinRiskAnalyzer;
import org.apache.datawise.backend.database.federated.FederatedQueryService;
import org.apache.datawise.backend.database.federated.FederatedSqlGenerator;
import org.apache.datawise.backend.domain.AnalyzeFederatedJoinRiskRequest;
import org.apache.datawise.backend.domain.ExecuteFederatedViewRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.FederatedJoinRiskHintsDto;
import org.apache.datawise.backend.domain.FederatedViewDetailDto;
import org.apache.datawise.backend.domain.FederatedViewSummaryDto;
import org.apache.datawise.backend.domain.GenerateFederatedSqlRequest;
import org.apache.datawise.backend.domain.GenerateFederatedSqlResult;
import org.apache.datawise.backend.domain.SaveFederatedViewRequest;
import org.apache.datawise.backend.common.pack.AiAccessGate;
import org.apache.datawise.backend.domain.AiMeterCapabilities;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.security.HeadlessSqlAuth;
import org.apache.datawise.backend.security.RequiresFeature;
import org.apache.datawise.backend.service.tenant.TenantQuotaService;
import org.springframework.beans.factory.ObjectProvider;
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
@RequestMapping("/api/platform/federated-views")
@RequiresFeature(UserFeaturePermission.WORKBENCH_CONSOLE_RUN)
public class FederatedQueryController {

    private final FederatedQueryService federatedQueryService;
    private final ObjectProvider<FederatedSqlGenerator> federatedSqlGenerator;
    private final ObjectProvider<AiAccessGate> aiAccessGate;
    private final TenantQuotaService tenantQuotaService;

    public FederatedQueryController(
            FederatedQueryService federatedQueryService,
            ObjectProvider<FederatedSqlGenerator> federatedSqlGenerator,
            ObjectProvider<AiAccessGate> aiAccessGate,
            TenantQuotaService tenantQuotaService
    ) {
        this.federatedQueryService = federatedQueryService;
        this.federatedSqlGenerator = federatedSqlGenerator;
        this.aiAccessGate = aiAccessGate;
        this.tenantQuotaService = tenantQuotaService;
    }

    @GetMapping
    public ApiResponse<List<FederatedViewSummaryDto>> list() {
        return ApiResponse.ok(federatedQueryService.list());
    }

    @GetMapping("/{id}")
    public ApiResponse<FederatedViewDetailDto> get(@PathVariable String id) {
        return ApiResponse.ok(federatedQueryService.get(id));
    }

    @PutMapping
    public ApiResponse<FederatedViewDetailDto> save(@RequestBody SaveFederatedViewRequest request) {
        return ApiResponse.ok(federatedQueryService.save(request));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable String id) {
        federatedQueryService.delete(id);
        return ApiResponse.ok(null);
    }

    @PostMapping("/execute")
    public ApiResponse<ExecuteSqlResult> execute(@RequestBody ExecuteFederatedViewRequest request) {
        HeadlessSqlAuth.requireSqlAccess();
        return ApiResponse.ok(federatedQueryService.execute(request));
    }

    @PostMapping("/generate-sql")
    public ApiResponse<GenerateFederatedSqlResult> generateSql(@RequestBody GenerateFederatedSqlRequest request) {
        HeadlessSqlAuth.requireSqlAccess();
        AiAccessGate gate = aiAccessGate.getIfAvailable();
        if (gate == null) {
            throw new IllegalStateException("Federated SQL generation requires the AI module (pack.ai)");
        }
        gate.requireAiPack();
        tenantQuotaService.requireAiCallQuota(AiMeterCapabilities.FEDERATED_SQL);
        FederatedSqlGenerator generator = federatedSqlGenerator.getIfAvailable();
        if (generator == null) {
            throw new IllegalStateException("Federated SQL generation requires the AI module (pack.ai)");
        }
        return ApiResponse.ok(generator.generate(request));
    }

    @PostMapping("/analyze-risk")
    public ApiResponse<FederatedJoinRiskHintsDto> analyzeRisk(@RequestBody AnalyzeFederatedJoinRiskRequest request) {
        HeadlessSqlAuth.requireSqlAccess();
        String sql = request != null ? request.sql() : null;
        return ApiResponse.ok(FederatedJoinRiskAnalyzer.analyze(sql));
    }
}
