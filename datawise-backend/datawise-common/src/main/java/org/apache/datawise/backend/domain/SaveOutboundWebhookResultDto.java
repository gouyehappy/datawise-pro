package org.apache.datawise.backend.domain;

public record SaveOutboundWebhookResultDto(
        OutboundWebhookDto webhook,
        boolean confirmationAttempted,
        boolean confirmationSkipped,
        OutboundWebhookTestResultDto confirmationResult) {
}
