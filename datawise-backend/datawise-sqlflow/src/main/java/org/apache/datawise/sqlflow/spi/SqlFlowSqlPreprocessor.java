package org.apache.datawise.sqlflow.spi;

import org.apache.datawise.sqlflow.api.SqlFlowAnalyzeRequest;

/** Pre-process SQL before handing it to SQLFlow (federated alias expansion, normalization, etc.). */
public interface SqlFlowSqlPreprocessor {

    default int order() {
        return 100;
    }

    String preprocess(String sql, SqlFlowAnalyzeRequest request);
}
