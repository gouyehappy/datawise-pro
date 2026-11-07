package org.apache.datawise.backend.common.pack;

import org.apache.datawise.backend.domain.RerunAnalysisCanvasRequest;

/**
 * Optional canvas parameter expand for MCP. Implemented by datawise-ai when present.
 * Return type is opaque so Core does not depend on AI DTO nesting.
 */
public interface AnalysisCanvasRerun {

    Object rerun(RerunAnalysisCanvasRequest request);
}
