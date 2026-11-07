package org.apache.datawise.backend.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.ddl.render.DialectSqlSupport;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.dml.dialect.DefaultJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;
import org.apache.datawise.backend.dml.spi.DmlDialect;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DmlDialectRegistryTest {

    private final DmlDialectRegistry registry = new DmlDialectRegistry(
            List.of(new FakeMysqlFamilyDmlDialect(), new FakePostgresqlDmlDialect(), new DefaultJdbcDmlDialect()),
            new ConnectorPluginContributionHolder());

    @Test
    void resolvesMysqlFamilyDialect() {
        assertEquals("mysql-family", registry.require("mysql").dialectId());
        assertEquals("mysql-family", registry.require("doris").dialectId());
    }

    @Test
    void resolvesPostgresqlFamilyDialect() {
        assertEquals("postgresql", registry.require("kingbase").dialectId());
    }

    @Test
    void buildInsertQuotesStringsAndUsesQualifiedTable() {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("id", 1);
        values.put("name", "O'Brien");

        String sql = registry.buildInsert("mysql", "shop", "users", values);

        assertEquals(
                "INSERT INTO `shop`.`users` (`id`, `name`) VALUES (1, 'O''Brien')",
                sql);
    }

    @Test
    void buildDeleteByPrimaryKeyUsesWhereClause() {
        Map<String, Object> pk = new LinkedHashMap<>();
        pk.put("id", 42);

        String sql = registry.buildDeleteByPrimaryKey("mysql", "shop", "users", pk);

        assertEquals("DELETE FROM `shop`.`users` WHERE `id` = 42", sql);
    }

    @Test
    void buildUpdateUsesSetAndWhereClause() {
        Map<String, Object> setValues = new LinkedHashMap<>();
        setValues.put("name", "Alice");
        Map<String, Object> keyValues = new LinkedHashMap<>();
        keyValues.put("id", 7);

        String sql = registry.buildUpdate("mysql", "shop", "users", setValues, keyValues);

        assertEquals("UPDATE `shop`.`users` SET `name` = 'Alice' WHERE `id` = 7", sql);
    }

    @Test
    void buildInsertRequiresValues() {
        assertThrows(IllegalArgumentException.class, () -> registry.buildInsert("mysql", "shop", "users", Map.of()));
    }

    @Test
    void buildInsertsFromTableDataUsesColumnKeys() {
        List<Map<String, Object>> columns = List.of(
                Map.of("key", "c1", "name", "id", "type", "INT"),
                Map.of("key", "c2", "name", "name", "type", "VARCHAR"));
        List<Map<String, Object>> rows = List.of(
                Map.of("c1", 1, "c2", "Alice"),
                Map.of("c1", 2, "c2", "Bob"));
        TableDataResult data = new TableDataResult(columns, rows);

        String sql = registry.buildInsertsFromTableData("mysql", "shop", "users", data);

        assertEquals(
                """
                        INSERT INTO `shop`.`users` (`id`, `name`) VALUES (1, 'Alice');
                        INSERT INTO `shop`.`users` (`id`, `name`) VALUES (2, 'Bob');
                        """,
                sql);
    }

    @Test
    void buildDropTableIfExistsUsesQualifiedName() {
        assertEquals(
                "DROP TABLE IF EXISTS `shop`.`users`;\n\n",
                registry.buildDropTableIfExists("mysql", "shop", "users"));
    }

    @Test
    void buildMultiInsertCombinesRows() {
        List<Map<String, Object>> columns = List.of(
                Map.of("key", "c1", "name", "id", "type", "INT"),
                Map.of("key", "c2", "name", "name", "type", "VARCHAR"));
        List<Map<String, Object>> rows = List.of(
                Map.of("c1", 1, "c2", "a"),
                Map.of("c1", 2, "c2", "b"));

        String sql = registry.buildMultiInsert("mysql", "shop", "users", columns, rows);

        assertEquals(
                "INSERT INTO `shop`.`users` (`id`, `name`) VALUES (1, 'a'), (2, 'b')",
                sql);
    }

    private static final class FakeMysqlFamilyDmlDialect extends AbstractJdbcDmlDialect implements DmlDialect {

        @Override
        public String dialectId() {
            return "mysql-family";
        }

        @Override
        public boolean supports(String dbType) {
            return DbType.isMysqlProtocol(dbType);
        }

        @Override
        public int priority() {
            return 20;
        }

        @Override
        public String quoteIdentifier(String name) {
            return DialectSqlSupport.quoteBacktick(DmlSqlSupport.sanitizeIdentifier(name));
        }

        @Override
        public String qualifiedTable(String database, String tableName) {
            return qualifiedDbTable(database, tableName);
        }
    }

    private static final class FakePostgresqlDmlDialect extends AbstractJdbcDmlDialect implements DmlDialect {

        @Override
        public String dialectId() {
            return "postgresql";
        }

        @Override
        public boolean supports(String dbType) {
            return DbType.isPostgresqlFamily(dbType);
        }

        @Override
        public int priority() {
            return 21;
        }

        @Override
        public String quoteIdentifier(String name) {
            return DialectSqlSupport.quoteDouble(DmlSqlSupport.sanitizeIdentifier(name));
        }

        @Override
        public String qualifiedTable(String database, String tableName) {
            return qualifiedDbTable(database, tableName);
        }
    }
}
