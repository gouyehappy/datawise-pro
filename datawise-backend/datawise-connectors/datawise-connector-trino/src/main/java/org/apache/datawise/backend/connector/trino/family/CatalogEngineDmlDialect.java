package org.apache.datawise.backend.connector.trino.family;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

/** Trino / Presto DML：双引号标识符与 catalog.schema.table 限定。 */
public class CatalogEngineDmlDialect extends AbstractJdbcDmlDialect {

    private final DbType dbType;
    private final int priority;

    public CatalogEngineDmlDialect(DbType dbType, int priority) {
        this.dbType = dbType;
        this.priority = priority;
    }

    @Override
    public String dialectId() {
        return dbType.id();
    }

    @Override
    public boolean supports(String dbType) {
        return this.dbType.id().equals(DbType.normalizeId(dbType));
    }

    @Override
    public int priority() {
        return priority;
    }

    @Override
    public String quoteIdentifier(String name) {
        return dbType.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.quoteQualifiedTable(dbType.id(), database, tableName);
    }
}
