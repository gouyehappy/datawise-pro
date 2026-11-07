package org.apache.datawise.backend.connector.greenplum.parser;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.parser.PostgresqlLogicalTypeParser;

/** Greenplum physical type parsing (PostgreSQL-protocol). */
public final class GreenplumLogicalTypeParser extends PostgresqlLogicalTypeParser {

    @Override
    public boolean supports(String dbType) {
        return DbType.GREENPLUM.matches(dbType);
    }

    @Override
    public int priority() {
        return 22;
    }
}
