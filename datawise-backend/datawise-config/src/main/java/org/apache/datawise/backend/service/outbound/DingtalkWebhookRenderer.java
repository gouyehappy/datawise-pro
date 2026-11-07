package org.apache.datawise.backend.service.outbound;

import org.apache.datawise.backend.domain.OutboundEvent;
import org.apache.datawise.backend.domain.OutboundWebhookChannels;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
final class DingtalkWebhookRenderer implements OutboundChannelRenderer {

    @Override
    public boolean supports(String channel) {
        return OutboundWebhookChannels.DINGTALK.equals(OutboundWebhookChannels.normalize(channel));
    }

    @Override
    public OutboundPreparedRequest prepare(OutboundChannelRenderContext context) {
        OutboundEvent event = context.event();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("msgtype", "markdown");
        Map<String, Object> markdown = new LinkedHashMap<>();
        markdown.put("title", OutboundChannelRenderSupport.issueTitle(event));
        markdown.put("text", OutboundChannelRenderSupport.appendDingtalkMentions(
                OutboundChannelRenderSupport.formatMarkdown(event),
                context.subscription()));
        body.put("markdown", markdown);
        if (context.subscription().mentionAll()
                || !context.subscription().mentionMobiles().isEmpty()
                || !context.subscription().mentionUserIds().isEmpty()) {
            Map<String, Object> at = new LinkedHashMap<>();
            at.put("isAtAll", context.subscription().mentionAll());
            if (!context.subscription().mentionMobiles().isEmpty()) {
                at.put("atMobiles", context.subscription().mentionMobiles());
            }
            if (!context.subscription().mentionUserIds().isEmpty()) {
                at.put("atUserIds", context.subscription().mentionUserIds());
            }
            body.put("at", at);
        }
        String url = context.webhook().getUrl();
        String secret = context.webhook().getSecret();
        if (secret != null && !secret.isBlank()) {
            long timestampMs = System.currentTimeMillis();
            String sign = OutboundChannelRenderSupport.dingtalkSign(timestampMs, secret.trim());
            url = OutboundChannelRenderSupport.appendQuery(url, "timestamp", String.valueOf(timestampMs));
            url = OutboundChannelRenderSupport.appendQuery(url, "sign", sign);
        }
        return OutboundPreparedRequest.of(url, body, false, Map.of());
    }
}
