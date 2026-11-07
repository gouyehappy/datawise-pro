package org.apache.datawise.backend.connector.dm.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;
import java.util.Locale;
import java.util.Set;

/** Dameng schema dialect: explorer database nodes map to owner/schema names. */
public class DmSchemaDialect implements SchemaDialect {

    private static final Set<String> SYSTEM_SCHEMAS = Set.of(
            "SYS",
            "SYSDBA",
            "SYSSSO",
            "SYSAUDITOR",
            "CTISYS",
            "SYSTEM"
    );

    @Override
    public String id() {
        return DbType.DM.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isDmFamily(dbType);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalogLabel) {
        return new SchemaScope(null, catalogLabel, catalogLabel);
    }

    @Override
    public SchemaScope resolveScope(Connection connection, String catalog, String schema) {
        String owner = schema != null && !schema.isBlank() ? schema : catalog;
        return new SchemaScope(null, owner, owner);
    }

    @Override
    public boolean isSystemSchema(String schema) {
        if (schema == null || schema.isBlank()) {
            return true;
        }
        String value = schema.trim().toUpperCase(Locale.ROOT);
        return SYSTEM_SCHEMAS.contains(value);
    }
}
