package org.apache.datawise.backend.domain;

public record OutboundWebhookTestResultDto(
        boolean ok,
        int statusCode,
        String message,
        String responseBody) {

    public OutboundWebhookTestResultDto(boolean ok, int statusCode, String message) {
        this(ok, statusCode, message, null);
    }
}
