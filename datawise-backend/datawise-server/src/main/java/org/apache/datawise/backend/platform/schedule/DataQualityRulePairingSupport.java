package org.apache.datawise.backend.platform.schedule;

import org.apache.datawise.backend.domain.DataQualityGatePairDto;
import org.apache.datawise.backend.model.ScheduledTaskEntry;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Match primary DQ rules to reference-env rules by case-insensitive name.
 */
final class DataQualityRulePairingSupport {

    private DataQualityRulePairingSupport() {
    }

    record PairPlan(
            List<DataQualityGatePairDto> pairs,
            List<String> matchedReferenceRuleIds,
            List<String> unpairedPrimaryNames
    ) {
    }

    static PairPlan plan(
            List<String> primaryRuleIds,
            List<String> primaryNames,
            List<ScheduledTaskEntry> referenceCandidates
    ) {
        Map<String, ScheduledTaskEntry> byName = indexByName(referenceCandidates);
        List<DataQualityGatePairDto> pairs = new ArrayList<>();
        List<String> matchedIds = new ArrayList<>();
        List<String> unpaired = new ArrayList<>();
        int n = Math.min(primaryRuleIds.size(), primaryNames.size());
        for (int i = 0; i < n; i++) {
            String ruleId = primaryRuleIds.get(i);
            String name = primaryNames.get(i) != null ? primaryNames.get(i) : "";
            String key = normalizeName(name);
            ScheduledTaskEntry match = key.isEmpty() ? null : byName.get(key);
            if (match != null) {
                pairs.add(new DataQualityGatePairDto(name, ruleId, match.getId(), true));
                if (!matchedIds.contains(match.getId())) {
                    matchedIds.add(match.getId());
                }
            } else {
                pairs.add(new DataQualityGatePairDto(name, ruleId, null, false));
                unpaired.add(name.isBlank() ? ruleId : name);
            }
        }
        return new PairPlan(List.copyOf(pairs), List.copyOf(matchedIds), List.copyOf(unpaired));
    }

    static Map<String, ScheduledTaskEntry> indexByName(List<ScheduledTaskEntry> candidates) {
        Map<String, List<ScheduledTaskEntry>> groups = new HashMap<>();
        for (ScheduledTaskEntry entry : candidates) {
            String key = normalizeName(entry.getName());
            if (key.isEmpty()) {
                continue;
            }
            groups.computeIfAbsent(key, ignored -> new ArrayList<>()).add(entry);
        }
        Map<String, ScheduledTaskEntry> best = new HashMap<>();
        for (Map.Entry<String, List<ScheduledTaskEntry>> group : groups.entrySet()) {
            best.put(group.getKey(), pickPreferred(group.getValue()));
        }
        return best;
    }

    static ScheduledTaskEntry pickPreferred(List<ScheduledTaskEntry> candidates) {
        return candidates.stream()
                .sorted(Comparator
                        .comparing((ScheduledTaskEntry e) -> !isBlocking(e))
                        .thenComparing(ScheduledTaskEntry::getId, Comparator.nullsLast(String::compareTo)))
                .findFirst()
                .orElse(candidates.get(0));
    }

    static String normalizeName(String name) {
        return name == null ? "" : name.trim().toLowerCase(Locale.ROOT);
    }

    private static boolean isBlocking(ScheduledTaskEntry entry) {
        String json = entry.getPayloadJson();
        if (json == null || json.isBlank()) {
            return false;
        }
        String lower = json.toLowerCase(Locale.ROOT);
        return lower.contains("\"blocking\":true") || lower.contains("\"blocking\": true");
    }
}
