package org.apache.datawise.sqlflow.dialect;

import org.apache.datawise.sqlflow.api.SqlFlowAnalyzeOptions;

/** Per-dialect default analysis options. */
public interface SqlFlowAnalyzeOptionsProfile {

    SqlFlowAnalyzeOptions apply(SqlFlowAnalyzeOptions base, SqlFlowDialect dialect);
}
