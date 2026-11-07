package org.apache.datawise.backend.connector.api.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TableMetadataSupportTest {

    @Test
    void formatDataTypeAddsLengthWhenSupported() {
        assertEquals("varchar(100)", TableMetadataSupport.formatDataType("varchar", 100, 0));
        assertEquals("decimal(10,2)", TableMetadataSupport.formatDataType("decimal", 10, 2));
    }

    @Test
    void formatDataTypeSkipsLengthForIntegerLikeTypes() {
        assertEquals("bigint", TableMetadataSupport.formatDataType("bigint", 20, 0));
        assertEquals("datetime", TableMetadataSupport.formatDataType("datetime", 19, 0));
    }
}
