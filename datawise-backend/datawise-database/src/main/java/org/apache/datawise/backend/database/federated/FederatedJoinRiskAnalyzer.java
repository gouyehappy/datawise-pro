package org.apache.datawise.backend.database.federated;

import org.apache.datawise.backend.database.federated.FederatedJoinPredicatePushdown.PushdownResult;
import org.apache.datawise.backend.database.federated.FederatedJoinSqlParser.FederatedJoinPlan;
import org.apache.datawise.backend.database.federated.FederatedJoinSqlParser.FederatedJoinStep;
import org.apache.datawise.backend.domain.FederatedJoinRiskHintsDto;

/**
 * Static analysis of federated JOIN SQL for editor-side risk hints
 * (pushdown / residual counts, equality ON, truncation risk).
 */
public final class FederatedJoinRiskAnalyzer {

    private FederatedJoinRiskAnalyzer() {
    }

    public static FederatedJoinRiskHintsDto analyze(String sql) {
        if (sql == null || sql.isBlank()) {
            return unparseable("federated SQL is required");
        }
        try {
            FederatedJoinPlan plan = FederatedJoinSqlParser.parse(sql);
            PushdownResult pushdown = FederatedJoinPredicatePushdown.apply(plan);
            int pushed = countPushedConjuncts(pushdown);
            int residual = countResidualConjuncts(pushdown);
            boolean equalityJoin = isEqualityJoin(plan);
            boolean elevated = !equalityJoin || residual > 0;
            return new FederatedJoinRiskHintsDto(
                    true,
                    null,
                    plan.steps().size(),
                    pushed,
                    residual,
                    equalityJoin,
                    elevated,
                    FederatedJoinLimits.DEFAULT_MAX_ROWS,
                    FederatedJoinLimits.HARD_MAX_ROWS
            );
        } catch (IllegalArgumentException ex) {
            return unparseable(ex.getMessage() != null ? ex.getMessage() : "invalid federated SQL");
        }
    }

    private static FederatedJoinRiskHintsDto unparseable(String message) {
        return new FederatedJoinRiskHintsDto(
                false,
                message,
                0,
                0,
                0,
                false,
                true,
                FederatedJoinLimits.DEFAULT_MAX_ROWS,
                FederatedJoinLimits.HARD_MAX_ROWS
        );
    }

    private static int countPushedConjuncts(PushdownResult pushdown) {
        if (pushdown == null || pushdown.pushedByTableAlias() == null || pushdown.pushedByTableAlias().isEmpty()) {
            return 0;
        }
        int total = 0;
        for (String predicate : pushdown.pushedByTableAlias().values()) {
            total += FederatedJoinPredicatePushdown.splitAnd(predicate).size();
        }
        return total;
    }

    private static int countResidualConjuncts(PushdownResult pushdown) {
        if (pushdown == null || pushdown.residualWhere() == null || pushdown.residualWhere().isBlank()) {
            return 0;
        }
        return FederatedJoinPredicatePushdown.splitAnd(pushdown.residualWhere()).size();
    }

    private static boolean isEqualityJoin(FederatedJoinPlan plan) {
        if (plan == null || plan.steps() == null || plan.steps().size() < 2) {
            return false;
        }
        for (FederatedJoinStep step : plan.steps()) {
            if (step.onCondition() == null) {
                continue;
            }
            try {
                if (FederatedJoinExecutor.parseEqualityPairs(step.onCondition()).isEmpty()) {
                    return false;
                }
            } catch (IllegalArgumentException ex) {
                return false;
            }
        }
        // At least one JOIN step must carry ON (steps.size >= 2 implies join steps after FROM).
        boolean anyOn = plan.steps().stream().anyMatch(step -> step.onCondition() != null && !step.onCondition().isBlank());
        return anyOn;
    }
}
