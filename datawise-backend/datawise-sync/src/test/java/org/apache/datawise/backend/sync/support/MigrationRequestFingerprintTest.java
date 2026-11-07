package org.apache.datawise.backend.sync.support;

import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TableMigrationBatchTableRequest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

class MigrationRequestFingerprintTest {

    @Test
    void compute_isStableForSameRequest() {
        TableMigrationBatchRequest request = sampleRequest(null, null);
        assertEquals(
                MigrationRequestFingerprint.compute(request),
                MigrationRequestFingerprint.compute(request)
        );
    }

    @Test
    void compute_changesWhenWhereClauseChanges() {
        TableMigrationBatchRequest base = sampleRequest(null, null);
        TableMigrationBatchRequest changed = new TableMigrationBatchRequest(
                base.sourceConnectionId(),
                base.sourceDatabase(),
                base.targetConnectionId(),
                base.targetDatabase(),
                base.tables(),
                base.mode(),
                base.watermarkColumn(),
                base.orderByColumns(),
                "status = 'inactive'",
                base.batchSize(),
                base.throttleMs(),
                base.truncateTarget(),
                null,
                null,
                base.conflictStrategy(),
                base.maxRows()
        );
        assertNotEquals(
                MigrationRequestFingerprint.compute(base),
                MigrationRequestFingerprint.compute(changed)
        );
    }

    @Test
    void computeTable_includesSelectSqlAndBatchSize() {
        String first = MigrationRequestFingerprint.computeTable("users", "select * from users", 500);
        String second = MigrationRequestFingerprint.computeTable("users", "select * from users WHERE id > 0", 500);
        String third = MigrationRequestFingerprint.computeTable("users", "select * from users", 1000);
        assertNotEquals(first, second);
        assertNotEquals(first, third);
    }

    private static TableMigrationBatchRequest sampleRequest(String jobId, String resumeJobId) {
        return new TableMigrationBatchRequest(
                "src",
                "shop",
                "tgt",
                "warehouse",
                List.of(new TableMigrationBatchTableRequest("users", false)),
                null,
                null,
                null,
                "status = 'active'",
                500,
                0,
                true,
                jobId,
                resumeJobId,
                null,
                null
        );
    }
}
