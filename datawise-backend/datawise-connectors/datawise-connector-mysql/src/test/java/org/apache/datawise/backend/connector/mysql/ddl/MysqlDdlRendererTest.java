package org.apache.datawise.backend.connector.mysql.ddl;

import org.apache.datawise.backend.metadata.LogicalType;
import org.apache.datawise.backend.metadata.LogicalTypeKind;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MysqlDdlRendererTest {

    private final MysqlDdlRenderer renderer = new MysqlDdlRenderer();

    @Test
    void supportsMysqlFamilyDbTypes() {
        assertTrue(renderer.supports("mysql"));
        assertTrue(renderer.supports("mariadb"));
        assertFalse(renderer.supports("doris"));
        assertFalse(renderer.supports("starrocks"));
    }

    @Test
    void rendersTinyintForBoolean() {
        assertEquals("tinyint(1)", renderer.renderPhysicalType(
                new LogicalType(LogicalTypeKind.BOOLEAN, null, null, null, false, null, java.util.Map.of())
        ));
    }

    @Test
    void rendersOversizedVarcharAsMediumtext() {
        assertEquals("mediumtext", renderer.renderPhysicalType(
                new LogicalType(LogicalTypeKind.VARCHAR, 65533, null, null, false, "varchar(65533)", java.util.Map.of())
        ));
        assertEquals("varchar(100)", renderer.renderPhysicalType(
                new LogicalType(LogicalTypeKind.VARCHAR, 100, null, null, false, "varchar(100)", java.util.Map.of())
        ));
    }

    @Test
    void rendersDowngradedTextWithLengthHintAsMediumtext() {
        assertEquals("mediumtext", renderer.renderPhysicalType(
                new LogicalType(LogicalTypeKind.TEXT, 65533, null, null, false, null, java.util.Map.of())
        ));
    }
}
