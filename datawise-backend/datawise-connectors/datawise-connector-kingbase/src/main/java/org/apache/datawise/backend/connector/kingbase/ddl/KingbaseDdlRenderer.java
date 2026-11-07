package org.apache.datawise.backend.connector.kingbase.ddl;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.ddl.PostgresqlDdlRenderer;

/** Kingbase DDL rendering (PostgreSQL-compatible protocol). */
public final class KingbaseDdlRenderer extends PostgresqlDdlRenderer {

    @Override
    public String dialectId() {
        return DbType.KINGBASE.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.KINGBASE.matches(dbType);
    }

    @Override
    public int priority() {
        return 22;
    }
}
