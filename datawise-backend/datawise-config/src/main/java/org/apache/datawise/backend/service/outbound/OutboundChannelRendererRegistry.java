package org.apache.datawise.backend.service.outbound;

import org.springframework.stereotype.Component;

import java.util.List;

@Component
class OutboundChannelRendererRegistry {

    private final List<OutboundChannelRenderer> renderers;

    OutboundChannelRendererRegistry(List<OutboundChannelRenderer> renderers) {
        this.renderers = renderers;
    }

    OutboundPreparedRequest prepare(OutboundChannelRenderContext context) {
        String channel = context.webhook().getChannel();
        for (OutboundChannelRenderer renderer : renderers) {
            if (renderer.supports(channel)) {
                return renderer.prepare(context);
            }
        }
        throw new IllegalArgumentException("No outbound renderer for channel: " + channel);
    }
}
