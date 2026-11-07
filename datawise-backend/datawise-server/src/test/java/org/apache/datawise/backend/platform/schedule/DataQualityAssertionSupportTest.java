package org.apache.datawise.backend.platform.schedule;

import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DataQualityAssertionSupportTest {

    @Test
    void emptyResultPassesWhenNoRows() {
        assertDoesNotThrow(() -> DataQualityAssertionSupport.evaluate(
                result(0, List.of()),
                DataQualityAssertionSupport.EMPTY_RESULT,
                "0",
                null
        ));
    }

    @Test
    void emptyResultFailsWhenRowsPresent() {
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                DataQualityAssertionSupport.evaluate(
                        result(1, List.of(Map.of("c", 1))),
                        DataQualityAssertionSupport.EMPTY_RESULT,
                        "0",
                        null
                ));
        assertTrue(ex.getMessage().contains("DQ_ASSERTION_FAILED"));
    }

    @Test
    void scalarLtePassesAndFails() {
        ExecuteSqlResult ok = result(1, List.of(Map.of("bad_count", 3)));
        assertDoesNotThrow(() -> DataQualityAssertionSupport.evaluate(
                ok,
                DataQualityAssertionSupport.SCALAR_LTE,
                "5",
                "bad_count"
        ));
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                DataQualityAssertionSupport.evaluate(
                        ok,
                        DataQualityAssertionSupport.SCALAR_LTE,
                        "2",
                        "bad_count"
                ));
        assertTrue(ex.getMessage().contains("DQ_ASSERTION_FAILED"));
    }

    private static ExecuteSqlResult result(int rowCount, List<Map<String, Object>> rows) {
        return new ExecuteSqlResult(
                "select 1",
                rowCount,
                1L,
                List.of(Map.of("name", "c")),
                rows,
                null,
                null,
                null,
                false,
                null,
                null
        );
    }
}
