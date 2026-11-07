package org.apache.datawise.backend.service.outbound;

import org.apache.datawise.backend.domain.OutboundEvent;
import org.apache.datawise.backend.domain.OutboundWebhookChannels;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
final class FeishuWebhookRenderer implements OutboundChannelRenderer {

    @Override
    public boolean supports(String channel) {
        return OutboundWebhookChannels.FEISHU.equals(OutboundWebhookChannels.normalize(channel));
    }

    @Override
    public OutboundPreparedRequest prepare(OutboundChannelRenderContext context) {
        OutboundEvent event = context.event();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("msg_type", "text");
        Map<String, Object> content = new LinkedHashMap<>();
        String text = OutboundChannelRenderSupport.appendFeishuMentions(
                OutboundChannelRenderSupport.formatPlainText(event),
                context.subscription());
        content.put("text", text);
        body.put("content", content);
        String secret = context.webhook().getSecret();
        if (secret != null && !secret.isBlank()) {
            long timestampSec = System.currentTimeMillis() / 1000L;
            body.put("timestamp", String.valueOf(timestampSec));
            body.put("sign", OutboundChannelRenderSupport.feishuSign(timestampSec, secret.trim()));
        }
        return OutboundPreparedRequest.of(context.webhook().getUrl(), body, false, Map.of());
    }
}
