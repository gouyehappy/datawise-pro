package org.apache.datawise.backend.common.pack;

import java.util.Map;

/**
 * Optional canvas rerun used by scheduled tasks. Implemented in datawise-ai when present.
 */
public interface AnalysisCanvasTaskRunner {

    record Result(
            String canvasId,
            String title,
            int rowCount,
            String summary,
            String sql,
            String statusMessage) {
    }

    Result rerun(String canvasId, Map<String, String> parameterValues);
}
