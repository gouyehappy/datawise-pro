package org.apache.datawise.backend.connector.greenplum.ddl;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.ddl.PostgresqlDdlRenderer;

/** Greenplum DDL rendering (PostgreSQL-protocol). */
public final class GreenplumDdlRenderer extends PostgresqlDdlRenderer {

    @Override
    public String dialectId() {
        return DbType.GREENPLUM.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.GREENPLUM.matches(dbType);
    }

    @Override
    public int priority() {
        return 22;
    }
}
