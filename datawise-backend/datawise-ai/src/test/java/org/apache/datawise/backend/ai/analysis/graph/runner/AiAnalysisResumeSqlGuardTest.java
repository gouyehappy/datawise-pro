package org.apache.datawise.backend.ai.analysis.graph.runner;

import org.apache.datawise.backend.ai.service.AgentWriteGrantService;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Resume path must refuse when client confirmedSql does not equal checkpoint SAFE_SQL
 * (AI-01). Guard helpers used by {@link AiAnalysisGraphRunner#resume}.
 */
class AiAnalysisResumeSqlGuardTest {

    @Test
    void refusesConfirmedSqlThatDoesNotMatchCheckpointSafeSql() {
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> AgentWriteGrantService.requireConfirmedSqlMatchesSafeSql(
                        "DROP TABLE users",
                        "SELECT id FROM users LIMIT 10"));
        assertTrue(ex.getMessage().contains("SAFE_SQL"));
    }

    @Test
    void acceptsMatchingNormalizedSql() {
        assertDoesNotThrow(() -> AgentWriteGrantService.requireConfirmedSqlMatchesSafeSql(
                "SELECT 1\r\n",
                "\nSELECT 1 "));
    }

    @Test
    void refusesGrantConnectionOutsideSessionScope() {
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> AgentWriteGrantService.requireConnectionMatches(
                        "conn-grant",
                        "conn-session"));
        assertTrue(ex.getMessage().contains("connectionId"));
    }
}
