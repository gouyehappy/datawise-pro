package org.apache.datawise.sqlflow.dialect;

public interface SqlFlowDialectRegistry {

    SqlFlowDialect resolve(String dbTypeId);

    SqlFlowAnalyzeOptionsProfile optionsFor(String dbTypeId);
}
