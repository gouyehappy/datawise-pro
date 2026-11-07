package org.apache.datawise.backend.platform.schedule;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.DataQualityGatePairDto;
import org.apache.datawise.backend.domain.DataQualityGateRequest;
import org.apache.datawise.backend.domain.DataQualityGateResultDto;
import org.apache.datawise.backend.domain.DataQualityGateScopeResultDto;
import org.apache.datawise.backend.domain.DataQualityRuleRunDto;
import org.apache.datawise.backend.model.ScheduledTaskEntry;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/**
 * Release-gate evaluation for {@code data_quality} scheduled rules (single- and multi-env).
 */
final class DataQualityGateSupport {

    @FunctionalInterface
    interface RuleRunner {
        void run(ScheduledTaskEntry entry);
    }

    private DataQualityGateSupport() {
    }

    static DataQualityGateResultDto evaluate(
            DataQualityGateRequest request,
            List<ScheduledTaskEntry> allEntries,
            ObjectMapper objectMapper,
            RuleRunner runner
    ) {
        DataQualityGateRequest req = request != null
                ? request
                : new DataQualityGateRequest(null, null, null, null, null, null, null);
        boolean blockingOnly = req.blockingOnly() == null || Boolean.TRUE.equals(req.blockingOnly());

        DataQualityGateScopeResultDto primary = evaluateScope(
                allEntries,
                req.connectionId(),
                req.database(),
                req.ruleIds(),
                blockingOnly,
                objectMapper,
                runner
        );

        String referenceConnectionId = blankToNull(req.referenceConnectionId());
        if (referenceConnectionId == null) {
            return new DataQualityGateResultDto(
                    primary.passed(),
                    primary.total(),
                    primary.failed(),
                    primary.results(),
                    null,
                    null
            );
        }

        String primaryConnectionId = blankToNull(req.connectionId());
        String primaryDatabase = blankToNull(req.database());
        String resolvedReferenceDatabase = blankToNull(req.referenceDatabase());
        if (resolvedReferenceDatabase == null) {
            resolvedReferenceDatabase = primaryDatabase;
        }
        final String referenceDatabase = resolvedReferenceDatabase;
        if (referenceConnectionId.equals(primaryConnectionId)
                && Objects.equals(nullToEmpty(referenceDatabase), nullToEmpty(primaryDatabase))) {
            throw new IllegalArgumentException("reference scope must differ from primary connection/database");
        }

        boolean pairByName = req.pairByName() == null || Boolean.TRUE.equals(req.pairByName());
        if (!pairByName) {
            DataQualityGateScopeResultDto reference = evaluateScope(
                    allEntries,
                    referenceConnectionId,
                    referenceDatabase,
                    null,
                    true,
                    objectMapper,
                    runner
            );
            return aggregateMultiEnv(primary, reference, null);
        }

        List<ScheduledTaskEntry> referenceCandidates = allEntries.stream()
                .filter(entry -> ScheduledTaskEntry.TYPE_DATA_QUALITY.equals(entry.getType()))
                .filter(entry -> matchesDqScope(entry, referenceConnectionId, referenceDatabase, objectMapper))
                .toList();

        List<String> primaryIds = primary.results().stream().map(DataQualityRuleRunDto::ruleId).toList();
        List<String> primaryNames = primary.results().stream().map(DataQualityRuleRunDto::name).toList();
        DataQualityRulePairingSupport.PairPlan plan =
                DataQualityRulePairingSupport.plan(primaryIds, primaryNames, referenceCandidates);

        DataQualityGateScopeResultDto referenceMatched;
        if (plan.matchedReferenceRuleIds().isEmpty()) {
            referenceMatched = new DataQualityGateScopeResultDto(
                    blankToNull(referenceConnectionId),
                    blankToNull(referenceDatabase),
                    true,
                    0,
                    0,
                    List.of()
            );
        } else {
            referenceMatched = evaluateScope(
                    allEntries,
                    referenceConnectionId,
                    referenceDatabase,
                    plan.matchedReferenceRuleIds(),
                    false,
                    objectMapper,
                    runner
            );
        }

        List<DataQualityRuleRunDto> mergedResults = new ArrayList<>(referenceMatched.results());
        int unpairedFailed = 0;
        Instant unpairedAt = Instant.now();
        for (DataQualityGatePairDto pair : plan.pairs()) {
            if (pair.paired()) {
                continue;
            }
            unpairedFailed++;
            mergedResults.add(new DataQualityRuleRunDto(
                    "unpaired:" + (pair.primaryRuleId() != null ? pair.primaryRuleId() : pair.name()),
                    pair.name(),
                    true,
                    "failed",
                    "No matching rule by name on reference scope",
                    unpairedAt
            ));
        }
        int refFailed = referenceMatched.failed() + unpairedFailed;
        int refTotal = mergedResults.size();
        DataQualityGateScopeResultDto reference = new DataQualityGateScopeResultDto(
                blankToNull(referenceConnectionId),
                blankToNull(referenceDatabase),
                refFailed == 0,
                refTotal,
                refFailed,
                mergedResults
        );
        return aggregateMultiEnv(primary, reference, plan.pairs());
    }

    static DataQualityGateResultDto aggregateMultiEnv(
            DataQualityGateScopeResultDto primary,
            DataQualityGateScopeResultDto reference,
            List<DataQualityGatePairDto> pairs
    ) {
        int total = primary.total() + reference.total();
        int failed = primary.failed() + reference.failed();
        boolean passed = primary.passed() && reference.passed();
        return new DataQualityGateResultDto(
                passed,
                total,
                failed,
                primary.results(),
                List.of(primary, reference),
                pairs
        );
    }

    static DataQualityGateScopeResultDto evaluateScope(
            List<ScheduledTaskEntry> allEntries,
            String connectionId,
            String database,
            List<String> ruleIds,
            boolean blockingOnly,
            ObjectMapper objectMapper,
            RuleRunner runner
    ) {
        Set<String> ids = new HashSet<>();
        if (ruleIds != null) {
            for (String id : ruleIds) {
                if (id != null && !id.isBlank()) {
                    ids.add(id.trim());
                }
            }
        }
        List<ScheduledTaskEntry> rules = allEntries.stream()
                .filter(entry -> ScheduledTaskEntry.TYPE_DATA_QUALITY.equals(entry.getType()))
                .filter(entry -> matchesDqScope(entry, connectionId, database, objectMapper))
                .filter(entry -> {
                    if (!ids.isEmpty()) {
                        return ids.contains(entry.getId());
                    }
                    return !blockingOnly || isBlockingRule(entry, objectMapper);
                })
                .sorted(Comparator.comparing(ScheduledTaskEntry::getName, Comparator.nullsLast(String::compareToIgnoreCase)))
                .toList();

        List<DataQualityRuleRunDto> results = new ArrayList<>();
        int failed = 0;
        for (ScheduledTaskEntry entry : rules) {
            runner.run(entry);
            boolean ok = "ok".equalsIgnoreCase(entry.getLastRunStatus());
            if (!ok) {
                failed++;
            }
            results.add(new DataQualityRuleRunDto(
                    entry.getId(),
                    entry.getName(),
                    isBlockingRule(entry, objectMapper),
                    entry.getLastRunStatus(),
                    entry.getLastRunMessage(),
                    entry.getLastRunAt()
            ));
        }
        return new DataQualityGateScopeResultDto(
                blankToNull(connectionId),
                blankToNull(database),
                failed == 0,
                results.size(),
                failed,
                results
        );
    }

    static boolean matchesDqScope(
            ScheduledTaskEntry entry,
            String connectionId,
            String database,
            ObjectMapper objectMapper
    ) {
        if ((connectionId == null || connectionId.isBlank()) && (database == null || database.isBlank())) {
            return true;
        }
        try {
            JsonNode payload = parsePayload(entry.getPayloadJson(), objectMapper);
            if (connectionId != null && !connectionId.isBlank()) {
                String actual = payload.path("connectionId").asText("").trim();
                if (!connectionId.trim().equals(actual)) {
                    return false;
                }
            }
            if (database != null && !database.isBlank()) {
                String actual = payload.path("database").asText("").trim();
                if (!database.trim().equalsIgnoreCase(actual)) {
                    return false;
                }
            }
            return true;
        } catch (Exception ex) {
            return false;
        }
    }

    static boolean isBlockingRule(ScheduledTaskEntry entry, ObjectMapper objectMapper) {
        try {
            JsonNode payload = parsePayload(entry.getPayloadJson(), objectMapper);
            if (!payload.has("blocking") || payload.get("blocking").isNull()) {
                return false;
            }
            JsonNode node = payload.get("blocking");
            if (node.isBoolean()) {
                return node.asBoolean(false);
            }
            String text = node.asText("").trim().toLowerCase(Locale.ROOT);
            return "true".equals(text) || "1".equals(text) || "yes".equals(text);
        } catch (Exception ex) {
            return false;
        }
    }

    static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static JsonNode parsePayload(String payloadJson, ObjectMapper objectMapper) throws Exception {
        if (payloadJson == null || payloadJson.isBlank()) {
            throw new IllegalArgumentException("payloadJson is required");
        }
        return objectMapper.readTree(payloadJson);
    }
}
