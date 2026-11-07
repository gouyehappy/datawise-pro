package org.apache.datawise.backend.service.outbound;

import org.apache.datawise.backend.domain.OutboundEvent;
import org.apache.datawise.backend.model.OutboundWebhookEntity;

import java.util.Map;

record OutboundChannelRenderContext(
        OutboundWebhookEntity webhook,
        OutboundWebhookResolvedSubscription subscription,
        OutboundEvent event,
        Map<String, Object> genericPayload) {
}
