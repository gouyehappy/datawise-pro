package org.apache.datawise.backend.connector.starrocks.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.introspect.MysqlFamilyIntrospectOptions;
import org.apache.datawise.backend.jdbc.introspect.MysqlFamilyTableIntrospector;

/** StarRocks 表元数据/DDL 读取（information_schema + SHOW CREATE TABLE）。 */
public class StarRocksTableIntrospector extends MysqlFamilyTableIntrospector {

    public StarRocksTableIntrospector() {
        super(MysqlFamilyIntrospectOptions.olap());
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.STARROCKS.matches(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }
}
