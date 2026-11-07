package org.apache.datawise.backend.connector.flink.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

/** Flink DML: ANSI double-quoted identifiers and catalog.schema.table qualification. */
public final class FlinkFamilyDmlDialect extends AbstractJdbcDmlDialect {

    @Override
    public String dialectId() {
        return DbType.FLINK.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.FLINK.matches(dbType);
    }

    @Override
    public int priority() {
        return 25;
    }

    @Override
    public String quoteIdentifier(String name) {
        return DbType.FLINK.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.quoteQualifiedTable(DbType.FLINK.id(), database, tableName);
    }
}
