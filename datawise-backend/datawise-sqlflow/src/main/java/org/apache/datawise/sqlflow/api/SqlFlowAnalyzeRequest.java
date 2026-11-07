package org.apache.datawise.sqlflow.api;

import org.apache.datawise.sqlflow.def.TableDef;
import org.apache.datawise.sqlflow.dialect.SqlFlowDialect;

import java.util.List;
import java.util.Objects;

/** Input for a single SQLFlow lineage analysis invocation. */
public final class SqlFlowAnalyzeRequest {

    private final String sql;
    private final String dbTypeId;
    private final SqlFlowDialect dialect;
    private final SqlFlowAnalyzeOptions options;
    private final List<TableDef> metadataTables;

    public SqlFlowAnalyzeRequest(String sql, String dbTypeId) {
        this(sql, dbTypeId, null, SqlFlowAnalyzeOptions.defaults(), List.of());
    }

    public SqlFlowAnalyzeRequest(String sql, String dbTypeId, List<TableDef> metadataTables) {
        this(sql, dbTypeId, null, SqlFlowAnalyzeOptions.defaults(), metadataTables);
    }

    public SqlFlowAnalyzeRequest(
            String sql,
            String dbTypeId,
            SqlFlowDialect dialect,
            SqlFlowAnalyzeOptions options,
            List<TableDef> metadataTables
    ) {
        this.sql = sql;
        this.dbTypeId = dbTypeId;
        this.dialect = dialect;
        this.options = options == null ? SqlFlowAnalyzeOptions.defaults() : options;
        this.metadataTables = metadataTables == null ? List.of() : List.copyOf(metadataTables);
    }

    public String sql() {
        return sql;
    }

    public String dbTypeId() {
        return dbTypeId;
    }

    public SqlFlowDialect dialect() {
        return dialect;
    }

    public SqlFlowAnalyzeOptions options() {
        return options;
    }

    public List<TableDef> metadataTables() {
        return metadataTables;
    }

    public SqlFlowAnalyzeRequest withSql(String newSql) {
        return new SqlFlowAnalyzeRequest(newSql, dbTypeId, dialect, options, metadataTables);
    }

    public SqlFlowAnalyzeRequest withDialect(SqlFlowDialect newDialect) {
        return new SqlFlowAnalyzeRequest(sql, dbTypeId, newDialect, options, metadataTables);
    }

    public SqlFlowAnalyzeRequest withOptions(SqlFlowAnalyzeOptions newOptions) {
        return new SqlFlowAnalyzeRequest(sql, dbTypeId, dialect, newOptions, metadataTables);
    }

    public SqlFlowAnalyzeRequest withMetadataTables(List<TableDef> tables) {
        return new SqlFlowAnalyzeRequest(sql, dbTypeId, dialect, options, tables);
    }

    @Override
    public boolean equals(Object other) {
        if (other == this) {
            return true;
        }
        if (!(other instanceof SqlFlowAnalyzeRequest that)) {
            return false;
        }
        return Objects.equals(sql, that.sql)
                && Objects.equals(dbTypeId, that.dbTypeId)
                && dialect == that.dialect
                && Objects.equals(options, that.options)
                && Objects.equals(metadataTables, that.metadataTables);
    }

    @Override
    public int hashCode() {
        return Objects.hash(sql, dbTypeId, dialect, options, metadataTables);
    }
}
