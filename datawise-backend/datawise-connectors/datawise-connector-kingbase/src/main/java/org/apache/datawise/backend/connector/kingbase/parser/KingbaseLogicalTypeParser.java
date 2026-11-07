package org.apache.datawise.backend.connector.kingbase.parser;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.parser.PostgresqlLogicalTypeParser;

/** Kingbase physical type parsing (PostgreSQL-compatible protocol). */
public final class KingbaseLogicalTypeParser extends PostgresqlLogicalTypeParser {

    @Override
    public boolean supports(String dbType) {
        return DbType.KINGBASE.matches(dbType);
    }

    @Override
    public int priority() {
        return 22;
    }
}
