package org.apache.datawise.backend.connector.sqlserver.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

/** T-SQL DML rendering for SQL Server ({@code [schema].[table]} qualification). */
public final class SqlServerFamilyDmlDialect extends AbstractJdbcDmlDialect {

    @Override
    public String dialectId() {
        return "sqlserver-family";
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isSqlServerFamily(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public String quoteIdentifier(String name) {
        return DbType.SQLSERVER.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.quoteQualifiedTable(DbType.SQLSERVER.id(), database, tableName);
    }

    @Override
    protected String sqlLiteral(Object value) {
        if (value instanceof byte[] bytes) {
            return DmlSqlSupport.binaryLiteralSqlServer(bytes);
        }
        return DmlSqlSupport.sqlLiteral(value);
    }
}
