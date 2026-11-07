package org.apache.datawise.sqlflow.engine;

import org.apache.datawise.sqlflow.api.SqlFlowAnalyzeRequest;
import org.apache.datawise.sqlflow.api.SqlFlowLineageEngine;
import org.apache.datawise.sqlflow.api.SqlFlowLineageResult;

/**
 * Placeholder engine used when Gudu gsp.jar is not on the classpath.
 * Returns a structured failure so callers can fall back to another parser.
 */
public final class UnavailableSqlFlowLineageEngine implements SqlFlowLineageEngine {

    public static final String ENGINE_ID = "sqlflow-unavailable";
    public static final String ENGINE_VERSION = "0.0.0";

    public static final UnavailableSqlFlowLineageEngine INSTANCE = new UnavailableSqlFlowLineageEngine();

    private UnavailableSqlFlowLineageEngine() {
    }

    @Override
    public String engineId() {
        return ENGINE_ID;
    }

    @Override
    public String engineVersion() {
        return ENGINE_VERSION;
    }

    @Override
    public boolean isAvailable() {
        return false;
    }

    @Override
    public SqlFlowLineageResult analyze(SqlFlowAnalyzeRequest request) {
        return SqlFlowLineageResult.failed(
                ENGINE_ID,
                ENGINE_VERSION,
                "GSP_JAR_MISSING",
                "SQLFlow GSP library is not installed. Place gsp.jar under datawise-sqlflow/lib "
                        + "and build with -Pwith-gsp, or provide a custom SqlFlowLineageEngine."
        );
    }
}
