package org.apache.datawise.backend.connector.dm.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.introspect.OracleDictionaryTableIntrospector;

/** Dameng table/view metadata via Oracle-compatible data dictionary views. */
public class DmTableIntrospector extends OracleDictionaryTableIntrospector {

    public DmTableIntrospector() {
        super("Dameng schema owner is required");
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isDmFamily(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }
}
