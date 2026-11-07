package org.apache.datawise.backend.connector.oracle.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.introspect.OracleDictionaryTableIntrospector;

/**
 * Oracle table/view metadata via shared dictionary introspector, plus internal-table guards.
 */
public class OracleTableIntrospector extends OracleDictionaryTableIntrospector {

    public OracleTableIntrospector() {
        super("Oracle schema owner is required");
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.ORACLE.id().equalsIgnoreCase(DbType.normalizeId(dbType));
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    protected void assertRelationAllowed(String schemaOwner, String objectName) {
        if (OracleInternalTableSupport.isInternalTable(objectName)) {
            throw new IllegalArgumentException(
                    "Cannot introspect Oracle internal table: " + schemaOwner + "." + objectName
            );
        }
    }
}
