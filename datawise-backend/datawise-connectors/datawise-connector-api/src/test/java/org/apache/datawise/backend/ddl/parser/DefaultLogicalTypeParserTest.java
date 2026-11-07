package org.apache.datawise.backend.ddl.parser;

import org.apache.datawise.backend.metadata.LogicalTypeKind;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DefaultLogicalTypeParserTest {

    private final DefaultLogicalTypeParser parser = new DefaultLogicalTypeParser();

    @Test
    void parsesCommonMysqlTypes() {
        assertEquals(LogicalTypeKind.INTEGER, parser.parse("int(11)").kind());
        assertEquals(LogicalTypeKind.VARCHAR, parser.parse("varchar(255)").kind());
        assertEquals(255, parser.parse("varchar(255)").length());
        assertEquals(LogicalTypeKind.DATETIME, parser.parse("datetime").kind());
        assertEquals(LogicalTypeKind.ENUM, parser.parse("enum('a','b')").kind());
    }

    @Test
    void parsesDecimalPrecisionAndScale() {
        var type = parser.parse("decimal(10,2)");
        assertEquals(LogicalTypeKind.DECIMAL, type.kind());
        assertEquals(10, type.precision());
        assertEquals(2, type.scale());
    }
}
