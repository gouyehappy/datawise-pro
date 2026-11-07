package org.apache.datawise.backend.connector.highgo.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.schema.PostgresqlSchemaDialect;

/** Highgo schema explorer dialect (PostgreSQL-protocol). */
public final class HighgoSchemaDialect extends PostgresqlSchemaDialect {

    @Override
    public String id() {
        return DbType.HIGHGO.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.HIGHGO.matches(dbType);
    }
}
