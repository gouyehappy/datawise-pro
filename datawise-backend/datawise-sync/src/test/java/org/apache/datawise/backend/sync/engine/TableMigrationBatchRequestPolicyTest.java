package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TableMigrationBatchTableRequest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class TableMigrationBatchRequestPolicyTest {

    @Test
    void validate_rejectsTooManyTables() {
        List<TableMigrationBatchTableRequest> tables = IntStream.range(0, 3)
                .mapToObj(index -> new TableMigrationBatchTableRequest("t" + index, false))
                .toList();
        TableMigrationBatchRequest request = new TableMigrationBatchRequest(
                "src",
                "shop",
                "tgt",
                "shop",
                tables,
                null,
                null,
                null,
                null,
                500,
                0,
                false,
                null,
                null,
                null,
                null
        );

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> TableMigrationBatchRequestPolicy.validate(request, 2)
        );
        assertEquals("tables exceeds max 2", ex.getMessage());
    }

    @Test
    void validate_acceptsWithinLimit() {
        TableMigrationBatchRequest request = new TableMigrationBatchRequest(
                "src",
                "shop",
                "tgt",
                "shop",
                List.of(new TableMigrationBatchTableRequest("users", false)),
                null,
                null,
                null,
                null,
                500,
                0,
                false,
                null,
                null,
                null,
                null
        );

        TableMigrationBatchRequestPolicy.validate(request, 2);
    }
}
