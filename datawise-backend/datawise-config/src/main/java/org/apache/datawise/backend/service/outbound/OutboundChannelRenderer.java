package org.apache.datawise.backend.service.outbound;

interface OutboundChannelRenderer {

    boolean supports(String channel);

    OutboundPreparedRequest prepare(OutboundChannelRenderContext context);
}
