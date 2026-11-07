package org.apache.datawise.backend.connector.doris.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.introspect.MysqlFamilyIntrospectOptions;
import org.apache.datawise.backend.jdbc.introspect.MysqlFamilyTableIntrospector;

/** Doris 表元数据/DDL 读取（information_schema + SHOW CREATE TABLE）。 */
public class DorisTableIntrospector extends MysqlFamilyTableIntrospector {

    public DorisTableIntrospector() {
        super(MysqlFamilyIntrospectOptions.olap());
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.DORIS.matches(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }
}
