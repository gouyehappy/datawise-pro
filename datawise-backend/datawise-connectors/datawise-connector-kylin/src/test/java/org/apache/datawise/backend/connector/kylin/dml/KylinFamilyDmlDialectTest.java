package org.apache.datawise.backend.connector.kylin.dml;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KylinFamilyDmlDialectTest {

    @Test
    void supportsKylin() {
        KylinFamilyDmlDialect dialect = new KylinFamilyDmlDialect();
        assertTrue(dialect.supports("kylin"));
    }

    @Test
    void quotesTableNames() {
        KylinFamilyDmlDialect dialect = new KylinFamilyDmlDialect();
        assertEquals("\"KYLIN_SALES\"", dialect.quoteIdentifier("KYLIN_SALES"));
        assertEquals("\"KYLIN_SALES\"", dialect.qualifiedTable("learn_kylin", "KYLIN_SALES"));
    }
}
