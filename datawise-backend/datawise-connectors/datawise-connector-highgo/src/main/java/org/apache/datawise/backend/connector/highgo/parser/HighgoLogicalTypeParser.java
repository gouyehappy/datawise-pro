package org.apache.datawise.backend.connector.highgo.parser;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.parser.PostgresqlLogicalTypeParser;

/** Highgo physical type parsing (PostgreSQL-protocol). */
public final class HighgoLogicalTypeParser extends PostgresqlLogicalTypeParser {

    @Override
    public boolean supports(String dbType) {
        return DbType.HIGHGO.matches(dbType);
    }

    @Override
    public int priority() {
        return 22;
    }
}
