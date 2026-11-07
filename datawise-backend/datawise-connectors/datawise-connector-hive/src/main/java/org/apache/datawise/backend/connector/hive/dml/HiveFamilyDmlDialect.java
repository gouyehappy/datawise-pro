package org.apache.datawise.backend.connector.hive.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.DmlSqlSupport;
import org.apache.datawise.backend.connector.hive.explorer.HiveSchemaExplorer;
import org.apache.datawise.backend.connector.hive.support.HiveMetadataSupport;

/** Hive DML: backtick-quoted identifiers and catalog.schema.table qualification. */
public final class HiveFamilyDmlDialect extends AbstractJdbcDmlDialect {

    @Override
    public String dialectId() {
        return DbType.HIVE.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.HIVE.id().equals(DbType.normalizeId(dbType));
    }

    @Override
    public int priority() {
        return 13;
    }

    @Override
    public String quoteIdentifier(String name) {
        return DbType.HIVE.quoteName(DmlSqlSupport.sanitizeIdentifier(name));
    }

    @Override
    public String qualifiedTable(String database, String tableName) {
        return HiveMetadataSupport.quoteQualifiedTable(database, tableName);
    }
}
