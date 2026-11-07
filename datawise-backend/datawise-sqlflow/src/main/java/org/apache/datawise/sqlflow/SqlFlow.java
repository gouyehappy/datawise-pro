package org.apache.datawise.sqlflow;

import org.apache.datawise.sqlflow.api.SqlFlowAnalyzeRequest;
import org.apache.datawise.sqlflow.api.SqlFlowLineageResult;
import org.apache.datawise.sqlflow.parser.SqlFlowParser;

/**
 * Entry point for SQL lineage analysis. Prefer {@link SqlFlowLineageServices} for full control.
 */
public final class SqlFlow {

    private static final SqlFlowParser SHARED_PARSER = new SqlFlowParser();

    private SqlFlow() {
    }

    public static SqlFlow newInstance() {
        return new SqlFlow();
    }

    public static SqlFlowParser sharedParser() {
        return SHARED_PARSER;
    }

    public SqlFlowLineageResult analyzeLineage(String sql, String dbTypeId) {
        return SqlFlowLineageServices.createDefault().analyze(new SqlFlowAnalyzeRequest(sql, dbTypeId));
    }
}
