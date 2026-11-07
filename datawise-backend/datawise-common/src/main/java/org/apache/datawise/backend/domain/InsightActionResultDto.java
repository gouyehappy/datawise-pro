package org.apache.datawise.backend.domain;

/** Result of publishing an insight action outbound event. */
public record InsightActionResultDto(
        String eventId,
        String type,
        String title,
        String ticketUrl,
        java.util.List<String> ticketUrls) {

    public InsightActionResultDto(String eventId, String type, String title) {
        this(eventId, type, title, null, java.util.List.of());
    }
}
