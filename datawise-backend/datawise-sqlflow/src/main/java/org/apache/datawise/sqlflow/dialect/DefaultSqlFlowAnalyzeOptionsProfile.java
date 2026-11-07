package org.apache.datawise.sqlflow.dialect;

import org.apache.datawise.sqlflow.api.SqlFlowAnalyzeOptions;

public final class DefaultSqlFlowAnalyzeOptionsProfile implements SqlFlowAnalyzeOptionsProfile {

    public static final DefaultSqlFlowAnalyzeOptionsProfile INSTANCE = new DefaultSqlFlowAnalyzeOptionsProfile();

    private DefaultSqlFlowAnalyzeOptionsProfile() {
    }

    @Override
    public SqlFlowAnalyzeOptions apply(SqlFlowAnalyzeOptions base, SqlFlowDialect dialect) {
        SqlFlowAnalyzeOptions effective = base == null ? SqlFlowAnalyzeOptions.defaults() : base;
        return switch (dialect) {
            case HIVE, IMPALA -> effective.toBuilder().showTemporaryTables(true).build();
            case ORACLE, MSSQL -> effective.toBuilder().tableLevelLineage(true).build();
            default -> effective;
        };
    }
}
