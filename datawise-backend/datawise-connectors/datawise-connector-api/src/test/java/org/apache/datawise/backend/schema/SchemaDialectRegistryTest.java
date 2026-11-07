package org.apache.datawise.backend.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SchemaDialectRegistryTest {

    @Test
    void resolvesMysqlFamily() {
        SchemaDialectRegistry registry = registryWith(new FakeDialect("mysql", true, false));
        assertEquals("mysql", registry.resolve("mysql").id());
        assertEquals("mysql", registry.resolve("mariadb").id());
    }

    @Test
    void resolvesPostgresqlFamily() {
        SchemaDialectRegistry registry = registryWith(new FakeDialect("postgresql", false, true));
        assertEquals("postgresql", registry.resolve("postgresql").id());
        assertEquals("postgresql", registry.resolve("kingbase").id());
    }

    @Test
    void fallsBackToGeneric() {
        SchemaDialectRegistry registry = registryWith(new FakeDialect("mysql", true, false));
        assertEquals("generic", registry.resolve("oracle").id());
    }

    private static SchemaDialectRegistry registryWith(SchemaDialect dialect) {
        return new SchemaDialectRegistry(
                List.of(dialect),
                new GenericSchemaDialect(),
                new ConnectorPluginContributionHolder());
    }

    private static final class FakeDialect implements SchemaDialect {

        private final String id;
        private final boolean mysql;
        private final boolean pg;

        private FakeDialect(String id, boolean mysql, boolean pg) {
            this.id = id;
            this.mysql = mysql;
            this.pg = pg;
        }

        @Override
        public String id() {
            return id;
        }

        @Override
        public boolean supports(String dbType) {
            if (mysql) {
                return DbType.isMysqlFamily(dbType);
            }
            if (pg) {
                return DbType.isPostgresqlFamily(dbType);
            }
            return false;
        }

        @Override
        public SchemaScope resolveScope(Connection connection, String catalogLabel) {
            return new SchemaScope(catalogLabel, null, catalogLabel);
        }
    }
}
