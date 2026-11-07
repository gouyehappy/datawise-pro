package org.apache.datawise.backend.connector.trino.sql;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.trino.family.CatalogEngineSqlPaginationDialect;

public final class TrinoSqlPaginationDialect extends CatalogEngineSqlPaginationDialect {

    public TrinoSqlPaginationDialect() {
        super(DbType.TRINO, 24);
    }
}
