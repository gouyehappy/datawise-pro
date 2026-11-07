package org.apache.datawise.backend.connector.opengauss.parser;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.parser.PostgresqlLogicalTypeParser;

/** openGauss physical type parsing (PostgreSQL-compatible protocol). */
public final class OpengaussLogicalTypeParser extends PostgresqlLogicalTypeParser {

    @Override
    public boolean supports(String dbType) {
        return DbType.OPENGAUSS.matches(dbType);
    }

    @Override
    public int priority() {
        return 22;
    }
}
