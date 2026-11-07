package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.common.support.ConnectionEnvironmentSupport;
import org.apache.datawise.backend.connector.api.support.SqlWriteClassifier;
import org.apache.datawise.sqlparser.ExplainSqlSupport;
import org.apache.datawise.sqlparser.analysis.SqlAnalysisSupport;
import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.SqlReviewFindingDto;
import org.apache.datawise.backend.domain.SqlReviewRequest;
import org.apache.datawise.backend.domain.SqlReviewResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.backend.service.ProductionWriteGuardService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * 执行前 SQL 智能审查：危险操作、全表扫描风险、生产写操作审批提示。
 */
@Service
public class SqlReviewService {

    private static final Pattern MISSING_WHERE = Pattern.compile(
            "\\b(DELETE|UPDATE)\\b[\\s\\S]*?(;|$)",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern FULL_TABLE_SCAN = Pattern.compile(
            "\\bFROM\\s+[\\w.`\"]+\\s*(;|$|GROUP|ORDER|LIMIT)",
            Pattern.CASE_INSENSITIVE
    );

    private final ConnectionVisibilityService connectionVisibilityService;
    private final ProductionWriteGuardService productionWriteGuardService;
    private final SqlService sqlService;

    public SqlReviewService(
            ConnectionVisibilityService connectionVisibilityService,
            ProductionWriteGuardService productionWriteGuardService,
            SqlService sqlService
    ) {
        this.connectionVisibilityService = connectionVisibilityService;
        this.productionWriteGuardService = productionWriteGuardService;
        this.sqlService = sqlService;
    }

    public SqlReviewResultDto review(SqlReviewRequest request) {
        if (request.sql() == null || request.sql().isBlank()) {
            throw new IllegalArgumentException("sql is required");
        }
        String sql = request.sql().trim();
        List<SqlReviewFindingDto> findings = new ArrayList<>();

        if (SqlWriteClassifier.requiresDangerousSqlConfirmation(sql)) {
            findings.add(finding(
                    "error",
                    "DANGEROUS_DML",
                    "SQL 包含 DELETE / UPDATE / DROP / TRUNCATE 等危险操作",
                    "请确认影响范围，或在非生产环境先验证"
            ));
        }

        if (SqlWriteClassifier.requiresDdlAccess(sql)) {
            findings.add(finding(
                    "error",
                    "DDL",
                    "SQL 包含 DDL 语句（CREATE / ALTER / DROP 等）",
                    "DDL 变更建议通过迁移向导或审批流程执行"
            ));
        }

        if (SqlAnalysisSupport.containsSelectStar(sql)) {
            findings.add(finding(
                    "warn",
                    "SELECT_STAR",
                    "使用了 SELECT *，可能返回过多列",
                    "仅选择需要的列以提升性能与可读性"
            ));
        }

        if (isMissingWhereDml(sql)) {
            findings.add(finding(
                    "error",
                    "MISSING_WHERE",
                    "UPDATE / DELETE 未检测到 WHERE 条件",
                    "添加 WHERE 子句以避免全表变更"
            ));
        }

        if (looksLikeFullTableScan(sql)) {
            findings.add(finding(
                    "warn",
                    "FULL_SCAN",
                    "查询可能触发全表扫描（无 WHERE / LIMIT）",
                    "添加过滤条件、索引列或 LIMIT 限制结果集"
            ));
        }

        appendExplainFindings(request, sql, findings);

        boolean requiresApproval = requiresProductionApproval(request, sql);
        if (requiresApproval) {
            findings.add(finding(
                    "warn",
                    "PROD_APPROVAL",
                    "生产环境写操作需要团队审批",
                    "提交生产审批后再执行，或联系团队管理员"
            ));
        }

        boolean devEnvironment = isDevEnvironment(request);
        boolean blocked = !devEnvironment
                && findings.stream().anyMatch(f -> "error".equals(f.severity()));
        return new SqlReviewResultDto(!blocked, requiresApproval, findings);
    }

    private boolean isDevEnvironment(SqlReviewRequest request) {
        if (request.connectionId() == null || request.connectionId().isBlank()) {
            return false;
        }
        return connectionVisibilityService.resolveConnectionEntity(request.connectionId())
                .map(ConnectionEnvironmentSupport::isDevelopment)
                .orElse(false);
    }

    private boolean requiresProductionApproval(SqlReviewRequest request, String sql) {
        if (request.connectionId() == null || request.connectionId().isBlank()) {
            return false;
        }
        Long userId = UserContext.getUserId();
        if (userId == null) {
            return false;
        }
        Optional<ConnectionEntity> connection = connectionVisibilityService.resolveConnectionEntity(request.connectionId());
        return connection
                .map(entity -> productionWriteGuardService.requiresProductionApproval(userId, entity, sql))
                .orElse(false);
    }

    private void appendExplainFindings(
            SqlReviewRequest request,
            String sql,
            List<SqlReviewFindingDto> findings
    ) {
        if (!shouldRunExplain(request, sql)) {
            return;
        }
        Optional<ConnectionEntity> connectionOpt = connectionVisibilityService.resolveConnectionEntity(request.connectionId());
        if (connectionOpt.isEmpty()) {
            return;
        }
        ConnectionEntity connection = connectionOpt.get();
        String explainSql = ExplainSqlSupport.wrapExplain(sql, connection.getDbType());
        if (explainSql == null) {
            return;
        }
        try {
            ExecuteSqlResult explain = sqlService.execute(new ExecuteSqlRequest(
                    explainSql,
                    request.connectionId(),
                    request.database(),
                    200,
                    null,
                    null,
                    null,
                    "sql-review-explain"
            ));
            findings.addAll(analyzeExplainResult(connection.getDbType(), explain));
        } catch (RuntimeException ignored) {
            findings.add(finding(
                    "warn",
                    "EXPLAIN_UNAVAILABLE",
                    "未能获取执行计划，已跳过 EXPLAIN 深度审查",
                    "检查连接权限后重试，或手动执行 EXPLAIN"
            ));
        }
    }

    private static boolean shouldRunExplain(SqlReviewRequest request, String sql) {
        if (request.connectionId() == null || request.connectionId().isBlank()) {
            return false;
        }
        if (sql == null || sql.isBlank()) {
            return false;
        }
        String upper = sql.trim().toUpperCase(Locale.ROOT);
        if (upper.startsWith("EXPLAIN ")) {
            return false;
        }
        return upper.startsWith("SELECT ") || upper.startsWith("WITH ");
    }

    private static List<SqlReviewFindingDto> analyzeExplainResult(String dbType, ExecuteSqlResult explain) {
        String normalized = dbType == null ? "" : dbType.trim().toLowerCase(Locale.ROOT);
        if (normalized.equals("mysql") || normalized.equals("mariadb")) {
            return analyzeMysqlExplain(explain);
        }
        return analyzeGenericExplain(explain);
    }

    private static List<SqlReviewFindingDto> analyzeMysqlExplain(ExecuteSqlResult explain) {
        List<SqlReviewFindingDto> findings = new ArrayList<>();
        if (explain.rows() == null || explain.rows().isEmpty()) {
            return findings;
        }
        for (Map<String, Object> row : explain.rows()) {
            String type = text(row, "type");
            String key = text(row, "key");
            String extra = text(row, "extra");
            long rowsExamined = longValue(row.get("rows"));
            if ("ALL".equalsIgnoreCase(type) || "index".equalsIgnoreCase(type)) {
                findings.add(finding(
                        "warn",
                        "EXPLAIN_FULL_SCAN",
                        "EXPLAIN 显示可能走全表/全索引扫描",
                        "为过滤列建立索引，或补充 WHERE 条件"
                ));
            }
            if (key == null || key.isBlank()) {
                findings.add(finding(
                        "warn",
                        "EXPLAIN_NO_INDEX",
                        "EXPLAIN 未命中有效索引",
                        "检查 JOIN/过滤字段是否有索引，并避免函数包裹索引列"
                ));
            }
            if (rowsExamined > 100000) {
                findings.add(finding(
                        "warn",
                        "EXPLAIN_HIGH_ROWS",
                        "EXPLAIN 估算扫描行数较大（" + rowsExamined + "）",
                        "缩小过滤范围，必要时拆分批次执行"
                ));
            }
            if (extra != null && (extra.toLowerCase(Locale.ROOT).contains("using filesort")
                    || extra.toLowerCase(Locale.ROOT).contains("using temporary"))) {
                findings.add(finding(
                        "warn",
                        "EXPLAIN_SORT_TEMP",
                        "EXPLAIN 显示可能使用临时表/文件排序",
                        "优化 ORDER BY/GROUP BY 字段顺序并匹配联合索引"
                ));
            }
        }
        return dedupeExplainFindings(findings);
    }

    private static List<SqlReviewFindingDto> analyzeGenericExplain(ExecuteSqlResult explain) {
        List<SqlReviewFindingDto> findings = new ArrayList<>();
        if (explain.rows() == null || explain.rows().isEmpty()) {
            return findings;
        }
        String text = explain.rows().stream()
                .map(Map::toString)
                .reduce("", (a, b) -> a + "\n" + b);
        String lower = text.toLowerCase(Locale.ROOT);
        if (lower.contains("seq scan") || lower.contains("full scan")) {
            findings.add(finding(
                    "warn",
                    "EXPLAIN_FULL_SCAN",
                    "执行计划包含全表扫描节点",
                    "为过滤条件补充索引，或限制扫描范围"
            ));
        }
        if (lower.contains("hash join") && !lower.contains("index")) {
            findings.add(finding(
                    "warn",
                    "EXPLAIN_JOIN_RISK",
                    "执行计划显示 JOIN 成本较高",
                    "检查关联键索引与数据倾斜，必要时分步查询"
            ));
        }
        return dedupeExplainFindings(findings);
    }

    private static List<SqlReviewFindingDto> dedupeExplainFindings(List<SqlReviewFindingDto> findings) {
        List<SqlReviewFindingDto> deduped = new ArrayList<>();
        List<String> seen = new ArrayList<>();
        for (SqlReviewFindingDto finding : findings) {
            if (seen.contains(finding.code())) {
                continue;
            }
            seen.add(finding.code());
            deduped.add(finding);
        }
        return deduped;
    }

    private static String text(Map<String, Object> row, String key) {
        if (row.containsKey(key) && row.get(key) != null) {
            return String.valueOf(row.get(key));
        }
        String upper = key.toUpperCase(Locale.ROOT);
        if (row.containsKey(upper) && row.get(upper) != null) {
            return String.valueOf(row.get(upper));
        }
        return null;
    }

    private static long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value == null) {
            return 0L;
        }
        try {
            return Long.parseLong(String.valueOf(value).trim());
        } catch (NumberFormatException ex) {
            return 0L;
        }
    }

    private static boolean isMissingWhereDml(String sql) {
        String upper = sql.toUpperCase(Locale.ROOT);
        if (!upper.startsWith("DELETE ") && !upper.startsWith("UPDATE ")) {
            return false;
        }
        return !upper.contains(" WHERE ");
    }

    private static boolean looksLikeFullTableScan(String sql) {
        String upper = sql.toUpperCase(Locale.ROOT);
        if (!upper.startsWith("SELECT ") && !upper.startsWith("WITH ")) {
            return false;
        }
        if (upper.contains(" WHERE ") || upper.contains(" LIMIT ") || upper.contains(" JOIN ")) {
            return false;
        }
        return FULL_TABLE_SCAN.matcher(sql).find();
    }

    private static SqlReviewFindingDto finding(String severity, String code, String message, String suggestion) {
        return new SqlReviewFindingDto(severity, code, message, suggestion);
    }
}
