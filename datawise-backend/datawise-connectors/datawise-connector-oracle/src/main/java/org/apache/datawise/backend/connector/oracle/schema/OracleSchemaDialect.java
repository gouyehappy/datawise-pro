package org.apache.datawise.backend.connector.oracle.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;

import java.sql.Connection;
import java.util.Locale;
import java.util.Set;

/** Oracle schema dialect: explorer database nodes map to owner/schema names. */
public class OracleSchemaDialect implements SchemaDialect {

    private static final Set<String> SYSTEM_SCHEMAS = Set.of(
            "SYS",
            "SYSTEM",
            "OUTLN",
            "DIP",
            "ORACLE_OCM",
            "APPQOSSYS",
            "DBSNMP",
            "CTXSYS",
            "MDSYS",
            "OLAPSYS",
            "ORDDATA",
            "ORDSYS",
            "SI_INFORMTN_SCHEMA",
            "WMSYS",
            "XDB",
            "AUDSYS",
            "GSMADMIN_INTERNAL",
            "OJVMSYS",
            "LBACSYS",
            "DVSYS",
            "DVF"
    );

    @Override
    public String id() {
        return DbType.ORACLE.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.ORACLE.matches(dbType);
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
        if (SYSTEM_SCHEMAS.contains(value)) {
            return true;
        }
        return value.startsWith("APEX_")
                || value.startsWith("FLOWS_")
                || value.startsWith("XS$")
                || value.startsWith("MDDATA_");
    }
}
