package org.apache.datawise.sqlparser;

import net.sf.jsqlparser.JSQLParserException;
import org.apache.datawise.backend.common.DbType;

/**
 * High-level entry for identifier quoting rewrite.
 */
public final class SqlRewriteService {

    private SqlRewriteService() {
    }

    public static String quoteIdentifiers(String sql, String dbTypeId) throws JSQLParserException {
        if (sql == null || sql.isBlank()) {
            return sql;
        }
        DbType dbType = DbType.find(DbType.normalizeId(dbTypeId)).orElse(DbType.MYSQL);
        return SQLHandlerChainExecutor.newInstance(sql)
                .executeQuoteHandlers(dbType)
                .getCurrentSql();
    }
}
