package org.apache.datawise.backend.connector.gaussdb.ddl;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.ddl.PostgresqlDdlRenderer;

/** Gaussdb DDL rendering (PostgreSQL-compatible protocol). */
public final class GaussdbDdlRenderer extends PostgresqlDdlRenderer {

    @Override
    public String dialectId() {
        return DbType.GAUSSDB.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.GAUSSDB.matches(dbType);
    }

    @Override
    public int priority() {
        return 22;
    }
}
