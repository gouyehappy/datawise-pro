package org.apache.datawise.backend.connector.mysql.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.introspect.MysqlFamilyIntrospectOptions;
import org.apache.datawise.backend.jdbc.introspect.MysqlFamilyTableIntrospector;

/** MySQL 族表元数据/DDL 读取（information_schema + SHOW CREATE TABLE）。 */
public class MysqlTableIntrospector extends MysqlFamilyTableIntrospector {

    public MysqlTableIntrospector() {
        super(MysqlFamilyIntrospectOptions.mysql());
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isMysqlFamily(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }
}
