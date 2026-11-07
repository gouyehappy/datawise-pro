package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.DataQualityGateRequest;
import org.apache.datawise.backend.domain.DataQualityGateResultDto;
import org.apache.datawise.backend.domain.DataQualityTemplateDto;
import org.apache.datawise.backend.domain.SaveDataQualityTemplateRequest;
import org.apache.datawise.backend.domain.ScheduledTaskDto;
import org.apache.datawise.backend.domain.pack.PackEntitlementChecker;
import org.apache.datawise.backend.domain.pack.PackIds;
import org.apache.datawise.backend.platform.schedule.ScheduledTaskService;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.apache.datawise.backend.service.platform.DataQualityTemplateService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import java.util.List;

/**
 * Data-quality rule catalog, shared templates, and release-gate evaluation.
 * Gated by Governance pack (Wave 35) — mirrors SchemaDrift dual gate.
 */
@RestController
@RequestMapping("/api/platform/data-quality")
public class DataQualityController {

    private final ScheduledTaskService scheduledTaskService;
    private final DataQualityTemplateService templateService;
    private final PackEntitlementChecker packEntitlementChecker;
    private final UserAdminPolicy userAdminPolicy;

    public DataQualityController(
            ScheduledTaskService scheduledTaskService,
            DataQualityTemplateService templateService,
            PackEntitlementChecker packEntitlementChecker,
            UserAdminPolicy userAdminPolicy
    ) {
        this.scheduledTaskService = scheduledTaskService;
        this.templateService = templateService;
        this.packEntitlementChecker = packEntitlementChecker;
        this.userAdminPolicy = userAdminPolicy;
    }

    /** List {@code data_quality} scheduled tasks (optional connection/database scope). */
    @GetMapping("/rules")
    public ApiResponse<List<ScheduledTaskDto>> listRules(
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String database
    ) {
        requireGovernanceAdmin();
        return ApiResponse.ok(scheduledTaskService.listDataQualityRules(connectionId, database));
    }

    /** Tenant-shared rule templates (file: {@code tenants/{tenantId}/data-quality-templates.json}). */
    @GetMapping("/templates")
    public ApiResponse<List<DataQualityTemplateDto>> listTemplates() {
        requireGovernanceAdmin();
        return ApiResponse.ok(templateService.list());
    }

    @PutMapping("/templates")
    public ApiResponse<DataQualityTemplateDto> saveTemplate(@Valid @RequestBody SaveDataQualityTemplateRequest request) {
        requireGovernanceAdmin();
        return ApiResponse.ok(templateService.save(request));
    }

    @DeleteMapping("/templates/{id}")
    public ApiResponse<Void> deleteTemplate(@PathVariable String id) {
        requireGovernanceAdmin();
        templateService.delete(id);
        return ApiResponse.ok(null);
    }

    /**
     * Evaluate release-gate suite. Always HTTP 200 with {@code passed} flag so CI can branch
     * on the body without treating assertion failures as transport errors.
     */
    @PostMapping("/gate")
    public ApiResponse<DataQualityGateResultDto> evaluateGate(@RequestBody(required = false) DataQualityGateRequest request) {
        requireGovernanceAdmin();
        return ApiResponse.ok(scheduledTaskService.evaluateDataQualityGate(
                request != null ? request : new DataQualityGateRequest(null, null, null, null, null, null, null)
        ));
    }

    private void requireGovernanceAdmin() {
        userAdminPolicy.requireAdminUser();
        packEntitlementChecker.requirePack(PackIds.GOVERNANCE);
    }
}
