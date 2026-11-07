package org.apache.datawise.backend.database.federated;

import org.apache.datawise.backend.domain.FederatedJoinRiskHintsDto;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FederatedJoinRiskAnalyzerTest {

    @Test
    void reportsPushdownResidualAndEqualityJoin() {
        String sql = """
                SELECT o.id, u.name
                FROM @orders o
                JOIN @users u ON o.user_id = u.id
                WHERE o.status = 'active' AND u.region = 'CN' AND o.user_id = u.id
                """;

        FederatedJoinRiskHintsDto hints = FederatedJoinRiskAnalyzer.analyze(sql);

        assertTrue(hints.parseable());
        assertEquals(2, hints.joinStepCount());
        assertEquals(2, hints.pushedFilterCount());
        assertEquals(1, hints.residualFilterCount());
        assertTrue(hints.equalityJoin());
        assertTrue(hints.truncationRiskElevated());
        assertEquals(FederatedJoinLimits.DEFAULT_MAX_ROWS, hints.defaultMaxRows());
        assertEquals(FederatedJoinLimits.HARD_MAX_ROWS, hints.hardMaxRows());
    }

    @Test
    void equalityJoinWithoutResidualIsLowerRisk() {
        String sql = """
                SELECT o.id, u.name
                FROM @orders o
                JOIN @users u ON o.user_id = u.id
                WHERE o.status = 'active'
                """;

        FederatedJoinRiskHintsDto hints = FederatedJoinRiskAnalyzer.analyze(sql);

        assertTrue(hints.parseable());
        assertEquals(1, hints.pushedFilterCount());
        assertEquals(0, hints.residualFilterCount());
        assertTrue(hints.equalityJoin());
        assertFalse(hints.truncationRiskElevated());
    }

    @Test
    void blankSqlIsUnparseable() {
        FederatedJoinRiskHintsDto hints = FederatedJoinRiskAnalyzer.analyze("  ");
        assertFalse(hints.parseable());
        assertTrue(hints.truncationRiskElevated());
    }
}
