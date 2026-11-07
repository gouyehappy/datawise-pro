package org.apache.datawise.backend.service.outbound;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.domain.OutboundEvent;
import org.apache.datawise.backend.domain.OutboundEventType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Publishes outbound events using registry-backed defaults and templates. */
@Component
public class OutboundNotifySupport {

    private static final Logger log = LoggerFactory.getLogger(OutboundNotifySupport.class);

    private final OutboundEventPublisher publisher;
    private final OutboundEventRegistry eventRegistry;

    public OutboundNotifySupport(OutboundEventPublisher publisher, OutboundEventRegistry eventRegistry) {
        this.publisher = publisher;
        this.eventRegistry = eventRegistry;
    }

    public void publish(String type, Map<String, Object> data, Collection<Long> recipients) {
        publish(type, data, null, null, recipients);
    }

    public void publish(String type, Map<String, Object> data, Long userId) {
        if (userId == null) {
            return;
        }
        publish(type, data, List.of(userId));
    }

    public void publish(String type, Map<String, Object> data, String bodyOverride, Long userId) {
        if (userId == null) {
            return;
        }
        publish(type, data, null, bodyOverride, List.of(userId));
    }

    public void publish(
                        String type,
                        Map<String, Object> data,
                        String titleOverride,
                        String bodyOverride,
                        Collection<Long> recipients) {
        if (recipients == null || recipients.isEmpty()) {
            return;
        }
        try {
            OutboundEvent event = eventRegistry.createEvent(
                    IdGenerator.shortId("evt-"),
                    type,
                    Instant.now(),
                    data != null ? data : Map.of(),
                    titleOverride,
                    bodyOverride);
            publisher.publishForUsers(event, recipients);
        } catch (RuntimeException ex) {
            ExceptionLogging.recoverable(log, "outbound.notify skipped type=" + type, ex);
        }
    }

    /**
     * Publish {@link OutboundEventType#INSIGHT_ACTION} and collect ticket URLs from issue channels.
     */
    public InsightActionPublishResult insightAction(String title, String body, Map<String, Object> details, Long userId) {
        if (userId == null) {
            throw new IllegalArgumentException("user is required");
        }
        Map<String, Object> data = details != null ? new LinkedHashMap<>(details) : new LinkedHashMap<>();
        String eventId = IdGenerator.shortId("evt-");
        OutboundEvent event = eventRegistry.createEvent(
                eventId,
                OutboundEventType.INSIGHT_ACTION,
                Instant.now(),
                data,
                title != null && !title.isBlank() ? title.trim() : "DataWise insight action",
                body != null ? body.trim() : "");
        List<String> ticketUrls = publisher.publishCollectingTicketUrls(event);
        return new InsightActionPublishResult(eventId, ticketUrls);
    }

    public record InsightActionPublishResult(String eventId, List<String> ticketUrls) {

        public InsightActionPublishResult {
            ticketUrls = ticketUrls != null ? List.copyOf(ticketUrls) : List.of();
        }

        public String primaryTicketUrl() {
            return ticketUrls.isEmpty() ? null : ticketUrls.get(0);
        }
    }
}
