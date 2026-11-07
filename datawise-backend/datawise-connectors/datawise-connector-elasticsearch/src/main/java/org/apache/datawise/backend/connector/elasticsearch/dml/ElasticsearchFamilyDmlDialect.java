package org.apache.datawise.backend.connector.elasticsearch.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;

/** Elasticsearch DML rendering with double-quoted index identifiers. */
public final class ElasticsearchFamilyDmlDialect extends AbstractJdbcDmlDialect {

    @Override
    public String dialectId() {
        return "elasticsearch-family";
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.ELASTICSEARCH.matches(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public String quoteIdentifier(String name) {
        return DbType.ELASTICSEARCH.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return DbType.ELASTICSEARCH.quoteName(DmlSqlSupport.sanitizeIdentifier(tableName));
    }
}
