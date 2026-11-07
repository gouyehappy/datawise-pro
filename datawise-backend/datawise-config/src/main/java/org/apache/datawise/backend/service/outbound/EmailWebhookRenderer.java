package org.apache.datawise.backend.service.outbound;

import org.apache.datawise.backend.domain.OutboundEvent;
import org.apache.datawise.backend.domain.OutboundWebhookChannels;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
final class EmailWebhookRenderer implements OutboundChannelRenderer {

    @Override
    public boolean supports(String channel) {
        return OutboundWebhookChannels.EMAIL.equals(OutboundWebhookChannels.normalize(channel));
    }

    @Override
    public OutboundPreparedRequest prepare(OutboundChannelRenderContext context) {
        OutboundEvent event = context.event();
        OutboundChannelRenderSupport.EmailTarget target = OutboundChannelRenderSupport.resolveEmailTarget(
                context.webhook().getUrl(),
                context.webhook().getSecret(),
                event);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("to", target.to());
        body.put("subject", OutboundChannelRenderSupport.issueTitle(event));
        body.put("text", OutboundChannelRenderSupport.formatPlainText(event));
        body.put("source", "datawise");
        if (event.type() != null && !event.type().isBlank()) {
            body.put("eventType", event.type());
        }
        if (event.id() != null && !event.id().isBlank()) {
            body.put("deliveryId", event.id());
        }
        Map<String, String> headers = new LinkedHashMap<>();
        if (target.apiKey() != null && !target.apiKey().isBlank()) {
            headers.put("Authorization", "Bearer " + target.apiKey());
        }
        return OutboundPreparedRequest.of(target.postUrl(), body, false, headers);
    }
}
