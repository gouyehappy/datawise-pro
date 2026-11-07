package org.apache.datawise.sqlflow.api;

/** Pluggable SQLFlow lineage analysis engine (GSP-backed or stub). */
public interface SqlFlowLineageEngine {

    String engineId();

    String engineVersion();

    boolean isAvailable();

    SqlFlowLineageResult analyze(SqlFlowAnalyzeRequest request);
}
