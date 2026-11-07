package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.graph.runtime.AiAnalysisStepContext;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.domain.AiAnalysisStepEvent;
import org.apache.datawise.backend.ai.domain.AiDatabaseTargetDto;
import org.apache.datawise.backend.security.UserContext;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

public final class AnalysisNodeSupport {

    private AnalysisNodeSupport() {
    }

    public record ConnectionScope(String prompt, String connectionId, String database) {
    }

    public static void emitStep(AiAnalysisStepEvent event) {
        AiAnalysisStepContext.emit(event);
    }

    /**
     * StateGraph 节点在 ForkJoin 线程执行，需从图 state 恢复 HTTP 会话用户。
     */
    public static Map<String, Object> runWithUserContext(
            OverAllState state,
            Supplier<Map<String, Object>> task
    ) {
        String runId = state.value(AiAnalysisGraphKeys.RUN_ID, String.class).orElse(null);
        return UserContext.runAs(
                resolveUserSnapshot(state),
                () -> AiAnalysisStepContext.runForRun(runId, task)
        );
    }

    static UserContext.Snapshot resolveUserSnapshot(OverAllState state) {
        Long userId = coerceUserId(state.value(AiAnalysisGraphKeys.USER_ID).orElse(null));
        if (userId == null) {
            return UserContext.snapshotOrNull();
        }
        boolean guest = state.value(AiAnalysisGraphKeys.USER_GUEST, Boolean.class).orElse(false);
        String sessionId = state.value(AiAnalysisGraphKeys.SESSION_ID, "");
        UserContext.Snapshot current = UserContext.snapshotOrNull();
        if (current != null
                && userId.equals(current.userId())
                && guest == current.guest()
                && sessionId.equals(current.sessionId())) {
            return current;
        }
        return new UserContext.Snapshot(userId, guest, sessionId);
    }

    private static Long coerceUserId(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Number number) {
            return number.longValue();
        }
        if (raw instanceof String text && !text.isBlank()) {
            return Long.parseLong(text.trim());
        }
        return null;
    }

    public static String requirePrompt(String prompt) {
        if (prompt == null || prompt.isBlank()) {
            throw new IllegalArgumentException("prompt is required");
        }
        return prompt.trim();
    }

    public static ConnectionScope readConnectionScope(OverAllState state) {
        return new ConnectionScope(
                state.value(AiAnalysisGraphKeys.PROMPT, ""),
                state.value(AiAnalysisGraphKeys.CONNECTION_ID, ""),
                state.value(AiAnalysisGraphKeys.DATABASE, "")
        );
    }

    public static AiDatabaseTargetDto resolvePrimaryTarget(List<AiDatabaseTargetDto> targets) {
        if (targets == null || targets.isEmpty()) {
            throw new IllegalArgumentException("Select at least one data source for analysis");
        }
        for (AiDatabaseTargetDto target : targets) {
            if (target.connectionId() != null && !target.connectionId().isBlank()) {
                return target;
            }
        }
        throw new IllegalArgumentException("Selected data source is missing connectionId");
    }

    public static String resolveDatabase(AiDatabaseTargetDto target) {
        if (target.database() != null && !target.database().isBlank()) {
            return target.database();
        }
        if (target.databaseLabel() != null && !target.databaseLabel().isBlank()) {
            return target.databaseLabel();
        }
        throw new IllegalArgumentException("Selected data source is missing database name");
    }

    public static List<String> listAdditionalTargets(
            List<AiDatabaseTargetDto> targets,
            AiDatabaseTargetDto primary
    ) {
        if (targets == null || targets.size() <= 1) {
            return List.of();
        }
        List<String> labels = new ArrayList<>();
        for (AiDatabaseTargetDto target : targets) {
            if (target == null || target == primary) {
                continue;
            }
            if (target.connectionId() == null || target.connectionId().isBlank()) {
                continue;
            }
            labels.add(formatTargetLabel(target));
        }
        return labels;
    }

    public static String formatTargetLabel(AiDatabaseTargetDto target) {
        StringBuilder builder = new StringBuilder();
        if (target.connectionLabel() != null && !target.connectionLabel().isBlank()) {
            builder.append(target.connectionLabel());
        } else {
            builder.append(target.connectionId());
        }
        String db = target.database() != null && !target.database().isBlank()
                ? target.database()
                : target.databaseLabel();
        if (db != null && !db.isBlank()) {
            builder.append('/').append(db);
        }
        return builder.toString();
    }
}
