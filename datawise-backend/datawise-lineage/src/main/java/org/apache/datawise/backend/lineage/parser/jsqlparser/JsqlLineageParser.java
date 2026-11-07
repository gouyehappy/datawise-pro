package org.apache.datawise.backend.lineage.parser.jsqlparser;

import net.sf.jsqlparser.JSQLParserException;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.select.Select;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.LineageDialectCompatibility;
import org.apache.datawise.backend.lineage.model.ColumnLineage;
import org.apache.datawise.backend.lineage.model.LineageParseRequest;
import org.apache.datawise.backend.lineage.model.LineageParseResult;
import org.apache.datawise.backend.lineage.model.LineageWarning;
import org.apache.datawise.backend.lineage.model.ParseStatus;
import org.apache.datawise.backend.lineage.resolver.ViewModelLineageLoader;
import org.apache.datawise.backend.lineage.spi.SqlLineageParser;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Component
public class JsqlLineageParser implements SqlLineageParser {

    private static final String ENGINE_ID = "jsqlparser";
    private static final String ENGINE_VERSION = "5.3";

    private static final Set<String> SUPPORTED = Set.of(
            DbType.MYSQL.id(),
            DbType.MARIADB.id(),
            DbType.TIDB.id(),
            DbType.POSTGRESQL.id(),
            DbType.KINGBASE.id(),
            DbType.OPENGAUSS.id(),
            DbType.HIGHGO.id(),
            DbType.GAUSSDB.id(),
            DbType.GREENPLUM.id(),
            DbType.ORACLE.id(),
            DbType.SQLSERVER.id(),
            DbType.DB2.id(),
            DbType.DM.id(),
            DbType.GENERIC.id()
    );

    private final ViewModelLineageLoader viewModelLineageLoader;

    public JsqlLineageParser(@Lazy ViewModelLineageLoader viewModelLineageLoader) {
        this.viewModelLineageLoader = viewModelLineageLoader;
    }

    @Override
    public boolean supports(String dbType) {
        if (dbType == null || dbType.isBlank()) {
            return true;
        }
        String normalized = DbType.normalizeId(dbType);
        return SUPPORTED.contains(normalized)
                || DbType.isMysqlFamily(normalized)
                || DbType.isPostgresqlFamily(normalized);
    }

    @Override
    public int priority() {
        return 100;
    }

    @Override
    public String engineId() {
        return ENGINE_ID;
    }

    @Override
    public String engineVersion() {
        return ENGINE_VERSION;
    }

    @Override
    public LineageParseResult parse(LineageParseRequest request) {
        String sql = request.sql();
        if (sql == null || sql.isBlank()) {
            return LineageParseResult.failed(ENGINE_ID, ENGINE_VERSION, "SQL is required");
        }
        List<LineageWarning> warnings = new ArrayList<>();
        try {
            Statement statement = CCJSqlParserUtil.parse(sql);
            if (!(statement instanceof Select select)) {
                return LineageParseResult.failed(ENGINE_ID, ENGINE_VERSION, "Only SELECT statements are supported");
            }
            JsqlLineageVisitorContext context = new JsqlLineageVisitorContext(
                    request.connectionId(),
                    request.database(),
                    warnings
            );
            JsqlRecursiveSelectAnalyzer analyzer = new JsqlRecursiveSelectAnalyzer(
                    context,
                    request,
                    viewModelLineageLoader
            );
            List<ColumnLineage> columns = analyzer.analyze(select);
            ParseStatus status = warnings.isEmpty() ? ParseStatus.COMPLETE : ParseStatus.PARTIAL;
            return new LineageParseResult(
                    columns,
                    warnings,
                    status,
                    ENGINE_ID,
                    ENGINE_VERSION,
                    LineageDialectCompatibility.UNKNOWN
            );
        } catch (JSQLParserException ex) {
            return LineageParseResult.failed(ENGINE_ID, ENGINE_VERSION, ex.getMessage());
        }
    }
}
