package org.apache.datawise.backend.connector.highgo.ddl;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.ddl.PostgresqlDdlRenderer;

/** Highgo DDL rendering (PostgreSQL-protocol). */
public final class HighgoDdlRenderer extends PostgresqlDdlRenderer {

    @Override
    public String dialectId() {
        return DbType.GREENPLUM.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.HIGHGO.matches(dbType);
    }

    @Override
    public int priority() {
        return 22;
    }
}
