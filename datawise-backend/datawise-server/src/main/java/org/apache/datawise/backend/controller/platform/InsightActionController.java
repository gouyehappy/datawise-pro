package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.CreateInsightActionRequest;
import org.apache.datawise.backend.domain.InsightActionResultDto;
import org.apache.datawise.backend.domain.OutboundEventType;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.outbound.OutboundNotifySupport;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Insight → ticket / runbook export. Publishes {@code insight.action} for outbound channels
 * (e.g. {@code github_issue} / {@code gitlab_issue} / {@code jira_issue}).
 */
@RestController
@RequestMapping("/api/platform/insight-actions")
public class InsightActionController {

    private final OutboundNotifySupport outboundNotifySupport;
    private final UserAccessPolicy userAccessPolicy;

    public InsightActionController(
            OutboundNotifySupport outboundNotifySupport,
            UserAccessPolicy userAccessPolicy
    ) {
        this.outboundNotifySupport = outboundNotifySupport;
        this.userAccessPolicy = userAccessPolicy;
    }

    @PostMapping
    public ApiResponse<InsightActionResultDto> create(@RequestBody CreateInsightActionRequest request) {
        userAccessPolicy.requireRegisteredUser();
        if (request == null) {
            throw new IllegalArgumentException("request is required");
        }
        if (request.title() == null || request.title().isBlank()) {
            throw new IllegalArgumentException("title is required");
        }
        Long userId = UserContext.getUserId();
        OutboundNotifySupport.InsightActionPublishResult published = outboundNotifySupport.insightAction(
                request.title(),
                request.body(),
                request.data(),
                userId
        );
        return ApiResponse.ok(new InsightActionResultDto(
                published.eventId(),
                OutboundEventType.INSIGHT_ACTION,
                request.title().trim(),
                published.primaryTicketUrl(),
                published.ticketUrls()
        ));
    }
}
