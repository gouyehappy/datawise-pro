package org.apache.datawise.backend.domain;

import java.util.Map;

public record RerunAnalysisCanvasRequest(
        String canvasId,
        Map<String, String> parameterValues) {
}
