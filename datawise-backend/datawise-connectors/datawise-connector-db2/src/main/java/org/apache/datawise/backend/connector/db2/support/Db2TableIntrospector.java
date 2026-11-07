package org.apache.datawise.backend.connector.db2.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.introspect.OracleDictionaryTableIntrospector;

/** DB2 table/view metadata via Oracle-compatible data dictionary views. */
public class Db2TableIntrospector extends OracleDictionaryTableIntrospector {

    public Db2TableIntrospector() {
        super("DB2 schema owner is required");
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isDb2Family(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }
}
