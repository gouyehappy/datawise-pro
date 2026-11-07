package org.apache.datawise.backend.connector.doris.ddl;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class DorisDdlSupportTest {

    @Test
    void quotesNumericDefaults() {
        assertEquals("\"0\"", DorisDdlSupport.formatDefaultClause("0"));
        assertEquals("\"10.5\"", DorisDdlSupport.formatDefaultClause("10.5"));
    }

    @Test
    void preservesQuotedAndKeywordDefaults() {
        assertEquals("'open'", DorisDdlSupport.formatDefaultClause("'open'"));
        assertEquals("CURRENT_TIMESTAMP", DorisDdlSupport.formatDefaultClause("CURRENT_TIMESTAMP"));
        assertNull(DorisDdlSupport.formatDefaultClause("NULL"));
    }
}
