package org.apache.datawise.sqlparser.analysis;

import net.sf.jsqlparser.JSQLParserException;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.Select;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.sqlparser.SQLHandlerChainExecutor;
import org.apache.datawise.sqlparser.VisitorContext;
import org.apache.datawise.sqlparser.handle.SelectStarReplaceHandler;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** AST-based SQL analysis (table / alias / column extraction). */
public final class SqlAnalysisSupport {

    private SqlAnalysisSupport() {
    }

    public static SqlAnalysisResult analyze(String sql) throws JSQLParserException {
        SqlAnalysisResult result = new SqlAnalysisResult();
        SQLHandlerChainExecutor executor = SQLHandlerChainExecutor.newInstance(sql);
        executor.executeHandlers(new VisitorContext(DbType.MYSQL), SqlAnalysisHandlers.all(result));
        return result;
    }

    public static List<String> extractReferencedTables(String sql) {
        try {
            return new ArrayList<>(analyze(sql).tables());
        } catch (JSQLParserException ignored) {
            return List.of();
        }
    }

    public static Map<String, String> buildAliasMap(String sql) {
        try {
            return Map.copyOf(analyze(sql).aliasToTable());
        } catch (JSQLParserException ignored) {
            return Map.of();
        }
    }

    public static List<QualifiedColumn> extractQualifiedColumns(String sql) {
        try {
            return List.copyOf(analyze(sql).qualifiedColumns());
        } catch (JSQLParserException ignored) {
            return List.of();
        }
    }

    public static List<String> extractUnqualifiedColumns(String sql, Map<String, String> aliasToTable) {
        try {
            SqlAnalysisResult result = analyze(sql);
            if (aliasToTable != null) {
                for (String alias : aliasToTable.keySet()) {
                    result.selectAliases().add(alias.toLowerCase(Locale.ROOT));
                }
            }
            return new ArrayList<>(result.unqualifiedColumns());
        } catch (JSQLParserException ignored) {
            return List.of();
        }
    }

    public static String resolveAlias(String tableOrAlias, Map<String, String> aliasToTable) {
        if (tableOrAlias == null || tableOrAlias.isBlank()) {
            return "";
        }
        String key = tableOrAlias.toLowerCase(Locale.ROOT);
        return aliasToTable == null ? key : aliasToTable.getOrDefault(key, key);
    }

    public static boolean containsSelectStar(String sql) {
        if (sql == null || sql.isBlank()) {
            return false;
        }
        try {
            Statement statement = CCJSqlParserUtil.parse(sql);
            if (!(statement instanceof Select select)) {
                return false;
            }
            PlainSelect plainSelect = select.getPlainSelect();
            return SelectStarReplaceHandler.containsSelectStar(plainSelect);
        } catch (JSQLParserException ignored) {
            return sql.replaceAll("\\s+", " ").trim().matches("(?is)SELECT\\s+\\*\\s+FROM\\b.*");
        }
    }
}
