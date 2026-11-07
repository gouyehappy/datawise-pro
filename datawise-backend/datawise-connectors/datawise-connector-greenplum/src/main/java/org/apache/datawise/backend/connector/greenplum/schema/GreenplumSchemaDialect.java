package org.apache.datawise.backend.connector.greenplum.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.schema.PostgresqlSchemaDialect;

/** Greenplum schema explorer dialect (PostgreSQL-protocol). */
public final class GreenplumSchemaDialect extends PostgresqlSchemaDialect {

    @Override
    public String id() {
        return DbType.GREENPLUM.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.GREENPLUM.matches(dbType);
    }
}
