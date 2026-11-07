package org.apache.datawise.backend.dml;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DmlColumnFilterTest {

    @Test
    void filterKnownColumnsMatchesCaseInsensitive() {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("ID", 1);
        values.put("unknown", "x");

        Map<String, Object> filtered = DmlColumnFilter.filterKnownColumns(
                values,
                List.of("id", "name"));

        assertEquals(1, filtered.size());
        assertEquals(1, filtered.get("id"));
    }
}
