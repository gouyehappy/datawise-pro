package org.apache.datawise.backend.domain.pack;

import java.util.List;
import java.util.Map;

/** Site-level trial registry persisted under {@code config/packs/trials.json}. */
public record PackTrialsDocument(
        Map<String, TrialEntry> trials) {

    public record TrialEntry(String startedAt, String expiresAt) {
    }

    public static PackTrialsDocument empty() {
        return new PackTrialsDocument(Map.of());
    }
}
