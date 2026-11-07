package org.apache.datawise.backend.platform.schedule;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.OrchestrationStatusDto;
import org.apache.datawise.backend.model.ScheduledTaskEntry;

import java.net.http.HttpClient;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Runs {@code http_trigger} scheduled tasks and optional status polling.
 */
final class ScheduledHttpTriggerSupport {

    record Outcome(String message, Map<String, Object> digest) {
    }

    private ScheduledHttpTriggerSupport() {
    }

    static Outcome run(
            ScheduledTaskEntry entry,
            JsonNode payload,
            ObjectMapper objectMapper,
            HttpClient httpClient
    ) throws Exception {
        OrchestrationHttpSupport.Result result = OrchestrationHttpSupport.execute(payload, objectMapper, httpClient);
        String ref = OrchestrationHttpSupport.extractRef(result.body(), objectMapper);
        String state = OrchestrationHttpSupport.extractState(result.body(), objectMapper, payload);
        Instant checked = Instant.now();
        if (ref != null && !ref.isBlank()) {
            entry.setOrchestrationRef(ref);
        }
        if (state != null && !state.isBlank()) {
            entry.setOrchestrationState(state);
            entry.setOrchestrationCheckedAt(checked);
            entry.setOrchestrationDetail(result.bodyPreview());
        }
        // Auto-poll when status URL is configured and we have a ref (or absolute statusUrl).
        if (canPoll(payload, entry.getOrchestrationRef())) {
            try {
                OrchestrationHttpSupport.Result status = OrchestrationHttpSupport.fetchStatus(
                        payload,
                        entry.getOrchestrationRef(),
                        objectMapper,
                        httpClient
                );
                String polledRef = OrchestrationHttpSupport.extractRef(status.body(), objectMapper);
                if (polledRef != null && !polledRef.isBlank()) {
                    entry.setOrchestrationRef(polledRef);
                }
                String polledState = OrchestrationHttpSupport.extractState(status.body(), objectMapper, payload);
                entry.setOrchestrationState(polledState != null ? polledState : "unknown");
                entry.setOrchestrationCheckedAt(Instant.now());
                entry.setOrchestrationDetail(status.bodyPreview());
            } catch (Exception ex) {
                // Trigger succeeded; status poll is best-effort (surface in detail).
                entry.setOrchestrationDetail(
                        "trigger ok; status poll failed: "
                                + (ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName())
                );
                entry.setOrchestrationCheckedAt(Instant.now());
            }
        }
        return new Outcome(buildMessage(result, entry), buildDigest(result, entry));
    }

    static OrchestrationStatusDto pollStatus(
            ScheduledTaskEntry entry,
            JsonNode payload,
            ObjectMapper objectMapper,
            HttpClient httpClient
    ) throws Exception {
        OrchestrationHttpSupport.Result result = OrchestrationHttpSupport.fetchStatus(
                payload,
                entry.getOrchestrationRef(),
                objectMapper,
                httpClient
        );
        String ref = OrchestrationHttpSupport.extractRef(result.body(), objectMapper);
        if (ref != null && !ref.isBlank()) {
            entry.setOrchestrationRef(ref);
        }
        String state = OrchestrationHttpSupport.extractState(result.body(), objectMapper, payload);
        Instant checked = Instant.now();
        entry.setOrchestrationState(state != null ? state : "unknown");
        entry.setOrchestrationCheckedAt(checked);
        entry.setOrchestrationDetail(result.bodyPreview());
        return new OrchestrationStatusDto(
                entry.getId(),
                entry.getName(),
                entry.getOrchestrationState(),
                entry.getOrchestrationRef(),
                entry.getOrchestrationDetail(),
                result.url(),
                result.statusCode(),
                checked
        );
    }

    static boolean canPoll(JsonNode payload, String orchestrationRef) {
        if (payload.has("statusUrl") && !payload.path("statusUrl").asText("").isBlank()) {
            return true;
        }
        return payload.has("statusUrlTemplate")
                && !payload.path("statusUrlTemplate").asText("").isBlank()
                && orchestrationRef != null
                && !orchestrationRef.isBlank();
    }

    private static Map<String, Object> buildDigest(
            OrchestrationHttpSupport.Result result,
            ScheduledTaskEntry entry
    ) {
        Map<String, Object> digest = new LinkedHashMap<>();
        digest.put("method", result.method());
        digest.put("url", result.url());
        digest.put("statusCode", result.statusCode());
        if (entry.getOrchestrationRef() != null) {
            digest.put("orchestrationRef", entry.getOrchestrationRef());
        }
        if (entry.getOrchestrationState() != null) {
            digest.put("orchestrationState", entry.getOrchestrationState());
        }
        if (result.bodyPreview() != null && !result.bodyPreview().isBlank()) {
            digest.put("responsePreview", result.bodyPreview());
        }
        return digest;
    }

    private static String buildMessage(OrchestrationHttpSupport.Result result, ScheduledTaskEntry entry) {
        String message = "HTTP " + result.statusCode() + " " + result.method() + " " + result.url();
        if (entry.getOrchestrationState() != null && !entry.getOrchestrationState().isBlank()) {
            message += " · state=" + entry.getOrchestrationState();
        }
        return message;
    }
}
