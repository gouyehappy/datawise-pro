package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.OutboundEventDefinitionDto;
import org.apache.datawise.backend.domain.OutboundWebhookDto;
import org.apache.datawise.backend.domain.OutboundWebhookTestResultDto;
import org.apache.datawise.backend.domain.SaveOutboundWebhookResultDto;
import org.apache.datawise.backend.domain.SaveOutboundWebhookRequest;
import org.apache.datawise.backend.domain.pack.PackEntitlementChecker;
import org.apache.datawise.backend.domain.pack.PackIds;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.apache.datawise.backend.service.outbound.OutboundWebhookService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import java.util.List;

@RestController
@RequestMapping("/api/platform/outbound-webhooks")
public class OutboundWebhookController {

    private final OutboundWebhookService outboundWebhookService;
    private final PackEntitlementChecker packEntitlementChecker;
    private final UserAdminPolicy userAdminPolicy;

    public OutboundWebhookController(
            OutboundWebhookService outboundWebhookService,
            PackEntitlementChecker packEntitlementChecker,
            UserAdminPolicy userAdminPolicy
    ) {
        this.outboundWebhookService = outboundWebhookService;
        this.packEntitlementChecker = packEntitlementChecker;
        this.userAdminPolicy = userAdminPolicy;
    }

    @GetMapping
    public ApiResponse<List<OutboundWebhookDto>> list() {
        requireSecurityAdmin();
        return ApiResponse.ok(outboundWebhookService.list());
    }

    @GetMapping("/schema")
    public ApiResponse<List<OutboundEventDefinitionDto>> schema() {
        requireSecurityAdmin();
        return ApiResponse.ok(outboundWebhookService.listEventDefinitions());
    }

    @PutMapping
    public ApiResponse<SaveOutboundWebhookResultDto> save(@Valid @RequestBody SaveOutboundWebhookRequest request) {
        requireSecurityAdmin();
        return ApiResponse.ok(outboundWebhookService.save(request));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable String id) {
        requireSecurityAdmin();
        outboundWebhookService.delete(id);
        return ApiResponse.ok(null);
    }

    @PostMapping("/{id}/test")
    public ApiResponse<OutboundWebhookTestResultDto> test(@PathVariable String id) {
        requireSecurityAdmin();
        return ApiResponse.ok(outboundWebhookService.test(id));
    }

    private void requireSecurityAdmin() {
        userAdminPolicy.requireAdminUser();
        packEntitlementChecker.requirePack(PackIds.SECURITY);
    }
}
