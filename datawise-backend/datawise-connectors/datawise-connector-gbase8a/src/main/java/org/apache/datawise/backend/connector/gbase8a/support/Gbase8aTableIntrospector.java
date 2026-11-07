package org.apache.datawise.backend.connector.gbase8a.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.introspect.MysqlFamilyIntrospectOptions;
import org.apache.datawise.backend.jdbc.introspect.MysqlFamilyTableIntrospector;

/** GBase 8a table/view metadata (information_schema + SHOW CREATE TABLE). */
public class Gbase8aTableIntrospector extends MysqlFamilyTableIntrospector {

    public Gbase8aTableIntrospector() {
        super(MysqlFamilyIntrospectOptions.mysql());
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.GBASE8A.matches(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }
}
