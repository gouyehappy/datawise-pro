package org.apache.datawise.backend.connector.postgresql.ops;

import org.apache.datawise.backend.common.DbType;

/** PostgreSQL 协议族运维 SQL（postgresql / kingbase / greenplum 等）。 */
public final class PostgresqlFamilyDatabaseOps extends AbstractPostgresqlDatabaseOps {

    @Override
    public String dialectId() {
        return "postgresql";
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isPostgresqlFamily(dbType);
    }

    @Override
    public int priority() {
        return 21;
    }
}
