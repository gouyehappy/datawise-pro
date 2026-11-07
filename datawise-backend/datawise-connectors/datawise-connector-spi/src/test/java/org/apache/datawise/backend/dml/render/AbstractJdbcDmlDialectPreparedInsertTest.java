package org.apache.datawise.backend.dml.render;

import org.apache.datawise.backend.dml.spi.DmlDialect;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AbstractJdbcDmlDialectPreparedInsertTest {

    private final AbstractJdbcDmlDialect dialect = new AbstractJdbcDmlDialect() {

        @Override
        public String dialectId() {
            return "test";
        }

        @Override
        public boolean supports(String dbType) {
            return true;
        }

        @Override
        public String quoteIdentifier(String name) {
            return "`" + name + "`";
        }

        @Override
        public String qualifiedTable(String database, String tableName) {
            return quoteIdentifier(database) + "." + quoteIdentifier(tableName);
        }
    };

    @Test
    void buildInsertPreparedUsesPlaceholders() {
        AbstractJdbcDmlDialect.MultiRowColumns meta = dialect.requireMultiRowColumns(List.of(
                Map.of("name", "id", "key", "id"),
                Map.of("name", "name", "key", "name")));
        assertEquals(
                "INSERT INTO `shop`.`users` (`id`, `name`) VALUES (?, ?)",
                dialect.buildInsertPrepared("shop", "users", meta));
        assertEquals(List.of("id", "name"), meta.keys());
    }

    @Test
    void dialectInterfaceIsAbstractJdbc() {
        DmlDialect asSpi = dialect;
        assertEquals("test", asSpi.dialectId());
    }
}
