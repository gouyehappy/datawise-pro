package org.apache.datawise.backend.connector.opengauss.ddl;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.ddl.PostgresqlDdlRenderer;

/** openGauss DDL rendering (PostgreSQL-compatible protocol). */
public final class OpengaussDdlRenderer extends PostgresqlDdlRenderer {

    @Override
    public String dialectId() {
        return DbType.OPENGAUSS.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.OPENGAUSS.matches(dbType);
    }

    @Override
    public int priority() {
        return 22;
    }
}
