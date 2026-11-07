package org.apache.datawise.backend.connector.gaussdb.parser;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.postgresql.parser.PostgresqlLogicalTypeParser;

/** Gaussdb physical type parsing (PostgreSQL-compatible protocol). */
public final class GaussdbLogicalTypeParser extends PostgresqlLogicalTypeParser {

    @Override
    public boolean supports(String dbType) {
        return DbType.GAUSSDB.matches(dbType);
    }

    @Override
    public int priority() {
        return 22;
    }
}
