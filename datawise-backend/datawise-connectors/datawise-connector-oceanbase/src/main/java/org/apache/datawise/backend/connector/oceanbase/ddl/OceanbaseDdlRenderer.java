package org.apache.datawise.backend.connector.oceanbase.ddl;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.mysql.ddl.MysqlDdlRenderer;

/** OceanBase DDL rendering (MySQL-protocol). */
public final class OceanbaseDdlRenderer extends MysqlDdlRenderer {

    @Override
    public String dialectId() {
        return DbType.OCEANBASE.id();
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.OCEANBASE.matches(dbType);
    }

    @Override
    public int priority() {
        return 22;
    }
}
