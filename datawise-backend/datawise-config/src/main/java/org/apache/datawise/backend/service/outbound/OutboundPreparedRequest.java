package org.apache.datawise.backend.service.outbound;

import java.util.Map;

record OutboundPreparedRequest(
        String url,
        Map<String, Object> body,
        boolean applyDataWiseSignature,
        Map<String, String> extraHeaders) {

    static OutboundPreparedRequest generic(String url, Map<String, Object> body) {
        return new OutboundPreparedRequest(url, body, true, Map.of());
    }

    static OutboundPreparedRequest of(String url, Map<String, Object> body, boolean applyDataWiseSignature, Map<String, String> extraHeaders) {
        return new OutboundPreparedRequest(
                url,
                body,
                applyDataWiseSignature,
                extraHeaders != null ? extraHeaders : Map.of());
    }
}
