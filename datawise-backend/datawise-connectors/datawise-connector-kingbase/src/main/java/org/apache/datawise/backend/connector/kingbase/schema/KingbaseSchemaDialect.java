package org.apache.datawise.backend.connector.kingbase.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.schema.PostgresqlSchemaDialect;

/** Kingbase schema explorer dialect (PostgreSQL-compatible protocol). */
public final class KingbaseSchemaDialect extends PostgresqlSchemaDialect {

    @Override
    public String id() {
        return DbType.KINGBASE.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.KINGBASE.matches(dbType);
    }
}
