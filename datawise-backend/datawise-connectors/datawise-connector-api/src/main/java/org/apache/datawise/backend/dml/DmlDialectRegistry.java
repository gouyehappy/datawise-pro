package org.apache.datawise.backend.dml;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.dml.dialect.DefaultJdbcDmlDialect;
import org.apache.datawise.backend.dml.render.AbstractJdbcDmlDialect;
import org.apache.datawise.backend.dml.spi.DmlDialect;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/** 按 dbType 解析 {@link DmlDialect} 并拼装行级 DML SQL。 */
@Component
public class DmlDialectRegistry {

    private final List<DmlDialect> classpathDialects;
    private final ConnectorPluginContributionHolder contributionHolder;

    public DmlDialectRegistry(
                              List<DmlDialect> classpathDialects,
                              ConnectorPluginContributionHolder contributionHolder) {
        this.classpathDialects = classpathDialects == null ? List.of() : List.copyOf(classpathDialects);
        this.contributionHolder = contributionHolder;
    }

    public DmlDialect require(String dbType) {
        String normalized = DbType.normalizeId(dbType);
        DmlDialect dialect = allDialects().stream()
                .filter(item -> item.supports(normalized))
                .min(Comparator.comparingInt(DmlDialect::priority))
                .orElseThrow(() -> new IllegalArgumentException("No DML dialect for dbType: " + normalized));
        if (dialect instanceof DefaultJdbcDmlDialect) {
            return new DbTypeBoundDmlDialect(normalized);
        }
        return dialect;
    }

    public String buildInsert(String dbType, String database, String tableName, Map<String, Object> values) {
        return require(dbType).buildInsert(database, tableName, values);
    }

    public String buildMultiInsert(
                                   String dbType,
                                   String database,
                                   String tableName,
                                   List<Map<String, Object>> columns,
                                   List<Map<String, Object>> rows) {
        return require(dbType).buildMultiInsert(database, tableName, columns, rows);
    }

    /**
     * Prepared single-row INSERT template + column keys for JDBC {@code addBatch}.
     * Returns {@code null} when the resolved dialect is not an {@link AbstractJdbcDmlDialect}.
     */
    public PreparedBatchInsert prepareBatchInsert(
                                                  String dbType,
                                                  String database,
                                                  String tableName,
                                                  List<Map<String, Object>> columns) {
        DmlDialect dialect = require(dbType);
        if (!(dialect instanceof AbstractJdbcDmlDialect jdbcDialect)) {
            return null;
        }
        AbstractJdbcDmlDialect.MultiRowColumns meta = jdbcDialect.requireMultiRowColumns(columns);
        String sql = jdbcDialect.buildInsertPrepared(database, tableName, meta);
        return new PreparedBatchInsert(sql, meta.keys());
    }

    /**
     * Prepared single-row UPSERT template + column keys for JDBC {@code addBatch}.
     * Returns {@code null} when the dialect does not support prepared upsert.
     */
    public PreparedBatchInsert prepareBatchUpsert(
                                                  String dbType,
                                                  String database,
                                                  String tableName,
                                                  List<Map<String, Object>> columns,
                                                  List<String> keyColumns,
                                                  String conflictStrategy) {
        DmlDialect dialect = require(dbType);
        if (!(dialect instanceof AbstractJdbcDmlDialect jdbcDialect)) {
            return null;
        }
        AbstractJdbcDmlDialect.MultiRowColumns meta = jdbcDialect.requireMultiRowColumns(columns);
        String sql = jdbcDialect.buildUpsertPrepared(
                database, tableName, meta, keyColumns, conflictStrategy);
        if (sql == null || sql.isBlank()) {
            return null;
        }
        return new PreparedBatchInsert(sql, meta.keys());
    }

    public record PreparedBatchInsert(String sql, List<String> columnKeys) {
    }

    public String buildMultiUpsert(
                                   String dbType,
                                   String database,
                                   String tableName,
                                   List<Map<String, Object>> columns,
                                   List<Map<String, Object>> rows,
                                   List<String> keyColumns,
                                   String conflictStrategy) {
        return require(dbType).buildMultiUpsert(
                database, tableName, columns, rows, keyColumns, conflictStrategy);
    }

    public String buildUpdate(
                              String dbType,
                              String database,
                              String tableName,
                              Map<String, Object> setValues,
                              Map<String, Object> keyValues) {
        return require(dbType).buildUpdate(database, tableName, setValues, keyValues);
    }

    public String buildDeleteByPrimaryKey(
                                          String dbType,
                                          String database,
                                          String tableName,
                                          Map<String, Object> primaryKeyValues) {
        return require(dbType).buildDeleteByPrimaryKey(database, tableName, primaryKeyValues);
    }

    public String buildTruncateTable(String dbType, String database, String tableName) {
        return require(dbType).buildTruncateTable(database, tableName);
    }

    public String buildDropTableIfExists(String dbType, String database, String tableName) {
        return require(dbType).buildDropTableIfExists(database, tableName);
    }

    public String buildInsertsFromTableData(
                                            String dbType,
                                            String database,
                                            String tableName,
                                            TableDataResult data) {
        return require(dbType).buildInsertsFromTableData(database, tableName, data);
    }

    private List<DmlDialect> allDialects() {
        if (contributionHolder.dmlDialects().isEmpty()) {
            return classpathDialects;
        }
        List<DmlDialect> merged = new ArrayList<>(classpathDialects);
        merged.addAll(contributionHolder.dmlDialects());
        return merged;
    }
}
