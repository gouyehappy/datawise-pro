package org.apache.datawise.backend.connector.presto.sql;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.trino.family.CatalogEngineSqlPaginationDialect;

public final class PrestoSqlPaginationDialect extends CatalogEngineSqlPaginationDialect {

    public PrestoSqlPaginationDialect() {
        super(DbType.PRESTO, 24);
    }
}
