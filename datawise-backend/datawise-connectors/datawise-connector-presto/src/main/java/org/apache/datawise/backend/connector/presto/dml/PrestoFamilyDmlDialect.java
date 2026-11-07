package org.apache.datawise.backend.connector.presto.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.trino.family.CatalogEngineDmlDialect;

public final class PrestoFamilyDmlDialect extends CatalogEngineDmlDialect {

    public PrestoFamilyDmlDialect() {
        super(DbType.PRESTO, 24);
    }
}
