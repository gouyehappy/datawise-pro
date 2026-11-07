package org.apache.datawise.backend.database.federated;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FederatedJoinLimitsTest {

    @Test
    void resolveOffsetDefaultsToZero() {
        assertEquals(0, FederatedJoinLimits.resolveOffset(null));
        assertEquals(0, FederatedJoinLimits.resolveOffset(0));
        assertEquals(0, FederatedJoinLimits.resolveOffset(-5));
    }

    @Test
    void resolveOffsetCapsAtMaxOffset() {
        assertEquals(500, FederatedJoinLimits.resolveOffset(500));
        assertEquals(FederatedJoinLimits.MAX_OFFSET, FederatedJoinLimits.resolveOffset(999_999));
    }

    @Test
    void applySourceWindowRewritesWhenOffsetPositive() {
        String sql = "SELECT id FROM orders";
        String paged = FederatedSourceSqlSupport.applySourceWindow(sql, 100, 1000);
        String lower = paged.toLowerCase();
        assertTrue(lower.contains("limit 1000, 100") || lower.contains("offset 1000"));
    }

    @Test
    void applySourceWindowLeavesSqlWhenOffsetZero() {
        String sql = "SELECT id FROM orders";
        assertEquals(sql, FederatedSourceSqlSupport.applySourceWindow(sql, 100, 0));
    }

    @Test
    void applySourceWindowRejectsInvalidLimit() {
        assertThrows(IllegalArgumentException.class, () -> FederatedSourceSqlSupport.applySourceWindow("select 1", 0, 10));
    }
}
