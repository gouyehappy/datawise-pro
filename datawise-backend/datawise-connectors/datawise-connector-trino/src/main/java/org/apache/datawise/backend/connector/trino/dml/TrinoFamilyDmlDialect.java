package org.apache.datawise.backend.connector.trino.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.trino.family.CatalogEngineDmlDialect;

public final class TrinoFamilyDmlDialect extends CatalogEngineDmlDialect {

    public TrinoFamilyDmlDialect() {
        super(DbType.TRINO, 24);
    }
}
