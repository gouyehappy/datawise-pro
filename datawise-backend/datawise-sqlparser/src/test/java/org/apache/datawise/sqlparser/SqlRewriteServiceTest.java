package org.apache.datawise.sqlparser;

import net.sf.jsqlparser.JSQLParserException;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import org.apache.datawise.backend.common.DbType;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlRewriteServiceTest {

    @Test
    void quoteIdentifiersShouldQuoteReservedTableAndColumnNames() throws JSQLParserException {
        String rewritten = SqlRewriteService.quoteIdentifiers(
                "select order from orders where status = 1",
                DbType.MYSQL.id()
        );
        assertTrue(rewritten.contains("`order`"));
        assertTrue(rewritten.contains("`orders`"));
        assertTrue(rewritten.contains("`status`"));
    }

    @Test
    void quoteIdentifiersShouldNotDoubleQuoteAlreadyQuotedNames() throws JSQLParserException {
        String sql = "select `order` from `orders`";
        String rewritten = SqlRewriteService.quoteIdentifiers(sql, DbType.MYSQL.id());
        assertTrue(rewritten.toLowerCase().contains("select `order` from `orders`"));
    }

    @Test
    void parseSmokeTestForInsertStatement() throws JSQLParserException {
        CCJSqlParserUtil.parse("insert into cdp_tag (tag_name, tag_schema) values ('a', '{\"k\":1}')");
    }
}
