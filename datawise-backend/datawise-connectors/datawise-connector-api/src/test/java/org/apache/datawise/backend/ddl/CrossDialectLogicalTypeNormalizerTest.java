package org.apache.datawise.backend.ddl;

import org.apache.datawise.backend.metadata.LogicalType;
import org.apache.datawise.backend.metadata.LogicalTypeKind;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CrossDialectLogicalTypeNormalizerTest {

    private final CrossDialectLogicalTypeNormalizer normalizer = new CrossDialectLogicalTypeNormalizer();

    @Test
    void downgradesEnumToTextAcrossFamilies() {
        LogicalType source = new LogicalType(LogicalTypeKind.ENUM, null, null, null, false, "enum('a','b')", Map.of());
        LogicalType mapped = normalizer.map(source, "mysql", "postgresql");
        assertEquals(LogicalTypeKind.TEXT, mapped.kind());
        assertEquals("enumSetDowngraded", normalizer.mappingWarning(source, "mysql", "postgresql"));
    }

    @Test
    void mapsDatetimeToTimestampForPostgresqlTarget() {
        LogicalType source = new LogicalType(LogicalTypeKind.DATETIME, null, null, null, false, "datetime", Map.of());
        LogicalType mapped = normalizer.map(source, "mysql", "postgresql");
        assertEquals(LogicalTypeKind.TIMESTAMP, mapped.kind());
    }

    @Test
    void passthroughWithinSameFamily() {
        LogicalType source = new LogicalType(LogicalTypeKind.BIGINT, 20, null, null, false, "bigint", Map.of());
        LogicalType mapped = normalizer.map(source, "mysql", "tidb");
        assertEquals(source, mapped);
        assertNull(normalizer.mappingWarning(source, "mysql", "tidb"));
    }

    @Test
    void stripsDisplayWidthFromBigintWhenCrossFamily() {
        LogicalType source = new LogicalType(LogicalTypeKind.BIGINT, 20, null, null, false, "bigint", Map.of());
        LogicalType mapped = normalizer.map(source, "mysql", "postgresql");
        assertEquals(LogicalTypeKind.BIGINT, mapped.kind());
        assertNull(mapped.length());
    }

    @Test
    void downgradesStarRocksLongVarcharToTextForMysql() {
        LogicalType source = new LogicalType(
                LogicalTypeKind.VARCHAR,
                65533,
                null,
                null,
                false,
                "varchar(65533)",
                Map.of());
        LogicalType mapped = normalizer.map(source, "starrocks", "mysql");
        assertEquals(LogicalTypeKind.TEXT, mapped.kind());
        assertEquals(65533, mapped.length());
        assertEquals("typeKindChanged", normalizer.mappingWarning(source, "starrocks", "mysql"));
    }

    @Test
    void keepsShortStarRocksVarcharAsVarcharForMysql() {
        LogicalType source = new LogicalType(
                LogicalTypeKind.VARCHAR,
                100,
                null,
                null,
                false,
                "varchar(100)",
                Map.of());
        LogicalType mapped = normalizer.map(source, "starrocks", "mysql");
        assertEquals(LogicalTypeKind.VARCHAR, mapped.kind());
        assertEquals(100, mapped.length());
        assertNull(normalizer.mappingWarning(source, "starrocks", "mysql"));
    }
}
