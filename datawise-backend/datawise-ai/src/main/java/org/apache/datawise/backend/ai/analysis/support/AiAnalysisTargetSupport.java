package org.apache.datawise.backend.ai.analysis.support;

import org.apache.datawise.backend.ai.domain.AiDatabaseTargetDto;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Normalizes AI analysis data-source targets for planning and federated execution.
 * Multiple table selections under the same connection/database are schema scope, not separate runtimes.
 */
public final class AiAnalysisTargetSupport {

    private AiAnalysisTargetSupport() {
    }

    public static List<AiDatabaseTargetDto> executableTargets(List<AiDatabaseTargetDto> targets) {
        List<AiDatabaseTargetDto> picked = new ArrayList<>();
        if (targets == null) {
            return picked;
        }
        for (AiDatabaseTargetDto target : targets) {
            if (target != null && target.connectionId() != null && !target.connectionId().isBlank()) {
                picked.add(target);
            }
        }
        return picked;
    }

    /**
     * Keeps the first target per connection + database. Table-level tags stay on the first pick
     * for labeling; execution only needs connectionId/database.
     */
    public static List<AiDatabaseTargetDto> uniqueByConnectionDatabase(List<AiDatabaseTargetDto> targets) {
        Map<String, AiDatabaseTargetDto> unique = new LinkedHashMap<>();
        for (AiDatabaseTargetDto target : executableTargets(targets)) {
            unique.putIfAbsent(connectionDatabaseKey(target), target);
        }
        return List.copyOf(unique.values());
    }

    public static String connectionDatabaseKey(AiDatabaseTargetDto target) {
        String connectionId = target.connectionId() == null ? "" : target.connectionId().trim();
        String database = resolveDatabase(target);
        return connectionId.toLowerCase(Locale.ROOT) + "\0" + database.toLowerCase(Locale.ROOT);
    }

    public static String resolveDatabase(AiDatabaseTargetDto target) {
        if (target.database() != null && !target.database().isBlank()) {
            return target.database().trim();
        }
        if (target.databaseLabel() != null && !target.databaseLabel().isBlank()) {
            return target.databaseLabel().trim();
        }
        return "";
    }

    public static String formatSourceLabel(AiDatabaseTargetDto target) {
        String db = resolveDatabase(target);
        String conn = target.connectionLabel() != null && !target.connectionLabel().isBlank()
                ? target.connectionLabel()
                : target.connectionId();
        return !db.isBlank() ? conn + "/" + db : conn;
    }
}
