package org.apache.datawise.backend.connector.oracle.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OracleInternalTableSupportTest {

    @Test
    void detectsIotOverflowTables() {
        assertTrue(OracleInternalTableSupport.isInternalTable("SYS_IOT_OVER_13282"));
        assertTrue(OracleInternalTableSupport.isInternalTable("bin$abc123"));
        assertFalse(OracleInternalTableSupport.isInternalTable("EMPLOYEES"));
    }
}
