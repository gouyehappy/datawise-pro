package org.apache.datawise.backend.ddl;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.ddl.spi.DialectDdlRenderer;
import org.apache.datawise.backend.metadata.ColumnDefinition;
import org.apache.datawise.backend.metadata.LogicalType;
import org.apache.datawise.backend.metadata.LogicalTypeKind;
import org.apache.datawise.backend.metadata.PrimaryKeyDefinition;
import org.apache.datawise.backend.metadata.TableDefinition;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DialectDdlRendererRegistryTest {

    private final DialectDdlRendererRegistry registry = new DialectDdlRendererRegistry(
            List.of(new FakeMysqlFamilyRenderer(), new FakePostgresqlRenderer()),
            new ConnectorPluginContributionHolder());

    @Test
    void resolvesMysqlFamilyRenderer() {
        assertEquals("mysql-family", registry.require("mysql").dialectId());
        assertEquals("mysql-family", registry.require("mariadb").dialectId());
    }

    @Test
    void resolvesPostgresqlRenderer() {
        assertEquals("postgresql", registry.require("kingbase").dialectId());
    }

    @Test
    void throwsWhenRendererMissing() {
        DdlException ex = assertThrows(DdlException.class, () -> registry.require("oracle"));
        assertEquals(DdlErrorCode.RENDERER_NOT_FOUND, ex.errorCode());
    }

    @Test
    void rendersCreateTableViaRegistry() {
        TableDefinition definition = new TableDefinition(
                "shop",
                "shop",
                "orders",
                List.of(new ColumnDefinition(
                        "id",
                        new LogicalType(LogicalTypeKind.BIGINT, null, null, null, false, null, Map.of()),
                        false,
                        null,
                        true,
                        null,
                        1)),
                new PrimaryKeyDefinition("pk_orders", List.of("id")),
                List.of(),
                List.of(),
                Map.of(),
                null);
        String ddl = registry.renderCreateTable(definition, "mysql", DdlRenderOptions.forTarget("shop", "mysql"));
        assertTrue(ddl.contains("CREATE TABLE"));
    }

    private static final class FakeMysqlFamilyRenderer implements DialectDdlRenderer {

        @Override
        public String dialectId() {
            return "mysql-family";
        }

        @Override
        public boolean supports(String dbType) {
            return DbType.isMysqlFamily(dbType);
        }

        @Override
        public int priority() {
            return 20;
        }

        @Override
        public String renderCreateTable(TableDefinition definition, DdlRenderOptions options) {
            return "CREATE TABLE mysql";
        }

        @Override
        public String renderPhysicalType(LogicalType type) {
            return "text";
        }
    }

    private static final class FakePostgresqlRenderer implements DialectDdlRenderer {

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
            return 20;
        }

        @Override
        public String renderCreateTable(TableDefinition definition, DdlRenderOptions options) {
            return "CREATE TABLE postgresql";
        }

        @Override
        public String renderPhysicalType(LogicalType type) {
            return "text";
        }
    }
}
