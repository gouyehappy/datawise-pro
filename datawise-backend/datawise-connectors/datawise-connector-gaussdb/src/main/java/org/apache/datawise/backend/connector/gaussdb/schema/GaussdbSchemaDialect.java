package org.apache.datawise.backend.connector.gaussdb.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.schema.PostgresqlSchemaDialect;

/** Gaussdb schema explorer dialect (PostgreSQL-compatible protocol). */
public final class GaussdbSchemaDialect extends PostgresqlSchemaDialect {

    @Override
    public String id() {
        return DbType.GAUSSDB.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.GAUSSDB.matches(dbType);
    }
}
