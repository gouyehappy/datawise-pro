package org.apache.datawise.sqlflow.spi;

import org.apache.datawise.sqlflow.api.SqlFlowAnalyzeRequest;

import java.util.Comparator;
import java.util.List;

public final class SqlFlowSqlPreprocessorChain {

    private final List<SqlFlowSqlPreprocessor> preprocessors;

    public SqlFlowSqlPreprocessorChain(List<SqlFlowSqlPreprocessor> preprocessors) {
        this.preprocessors = preprocessors == null ? List.of() : List.copyOf(preprocessors).stream()
                .sorted(Comparator.comparingInt(SqlFlowSqlPreprocessor::order))
                .toList();
    }

    public String apply(String sql, SqlFlowAnalyzeRequest request) {
        String current = sql;
        for (SqlFlowSqlPreprocessor preprocessor : preprocessors) {
            current = preprocessor.preprocess(current, request);
        }
        return current;
    }
}
