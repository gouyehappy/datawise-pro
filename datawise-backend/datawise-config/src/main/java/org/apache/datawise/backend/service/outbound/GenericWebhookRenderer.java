package org.apache.datawise.backend.service.outbound;

import org.apache.datawise.backend.domain.OutboundWebhookChannels;
import org.springframework.stereotype.Component;

@Component
final class GenericWebhookRenderer implements OutboundChannelRenderer {

    @Override
    public boolean supports(String channel) {
        return OutboundWebhookChannels.WEBHOOK.equals(OutboundWebhookChannels.normalize(channel));
    }

    @Override
    public OutboundPreparedRequest prepare(OutboundChannelRenderContext context) {
        return OutboundPreparedRequest.generic(context.webhook().getUrl(), context.genericPayload());
    }
}
