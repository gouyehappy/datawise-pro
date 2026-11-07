package org.apache.datawise.backend.connector.opengauss.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.schema.PostgresqlSchemaDialect;

/** openGauss schema explorer dialect (PostgreSQL-compatible protocol). */
public final class OpengaussSchemaDialect extends PostgresqlSchemaDialect {

    @Override
    public String id() {
        return DbType.OPENGAUSS.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.OPENGAUSS.matches(dbType);
    }
}
