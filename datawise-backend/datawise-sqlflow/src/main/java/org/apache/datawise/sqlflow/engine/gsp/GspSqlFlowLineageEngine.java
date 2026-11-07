package org.apache.datawise.sqlflow.engine.gsp;

import org.apache.datawise.sqlflow.api.SqlFlowAnalyzeRequest;
import org.apache.datawise.sqlflow.api.SqlFlowLineageEngine;
import org.apache.datawise.sqlflow.api.SqlFlowLineageResult;

/**
 * Gudu GSP bridge placeholder. When gsp.jar is on the classpath, a future implementation
 * can delegate to {@code DataFlowAnalyzer}; until then this reports {@code NOT_IMPLEMENTED}.
 */
public final class GspSqlFlowLineageEngine implements SqlFlowLineageEngine {

    public static final String ENGINE_ID = "gudu-gsp";
    public static final String ENGINE_VERSION = "unlicensed";

    private static final boolean GSP_PRESENT = probeGsp();

    @Override
    public String engineId() {
        return ENGINE_ID;
    }

    @Override
    public String engineVersion() {
        return GSP_PRESENT ? "gsp" : ENGINE_VERSION;
    }

    @Override
    public boolean isAvailable() {
        return GSP_PRESENT;
    }

    @Override
    public SqlFlowLineageResult analyze(SqlFlowAnalyzeRequest request) {
        if (!GSP_PRESENT) {
            return SqlFlowLineageResult.failed(
                    ENGINE_ID,
                    ENGINE_VERSION,
                    "GSP_JAR_MISSING",
                    "Gudu gsp.jar is not on the classpath. Place it under datawise-sqlflow/lib "
                            + "and build with -Pwith-gsp."
            );
        }
        return SqlFlowLineageResult.failed(
                ENGINE_ID,
                engineVersion(),
                "NOT_IMPLEMENTED",
                "GSP bridge is reserved for licensed deployments."
        );
    }

    private static boolean probeGsp() {
        try {
            Class.forName("gudusoft.gsqlparser.TGSqlParser");
            return true;
        } catch (ClassNotFoundException ignored) {
            return false;
        }
    }
}
