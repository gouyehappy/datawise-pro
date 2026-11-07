package org.apache.datawise.backend.ai.canvas;

import org.apache.datawise.backend.common.pack.AnalysisCanvasTaskRunner;
import org.apache.datawise.backend.domain.RerunAnalysisCanvasRequest;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class AnalysisCanvasTaskRunnerAdapter implements AnalysisCanvasTaskRunner {

    private final AnalysisCanvasPipelineService pipelineService;

    public AnalysisCanvasTaskRunnerAdapter(AnalysisCanvasPipelineService pipelineService) {
        this.pipelineService = pipelineService;
    }

    @Override
    public Result rerun(String canvasId, Map<String, String> parameterValues) {
        AnalysisCanvasPipelineService.PipelineRerunResult result = pipelineService.rerunPipeline(
                new RerunAnalysisCanvasRequest(
                        canvasId,
                        parameterValues == null || parameterValues.isEmpty() ? null : parameterValues
                )
        );
        return new Result(
                result.canvasId(),
                result.title(),
                result.rowCount(),
                result.summary(),
                result.sql(),
                result.statusMessage()
        );
    }
}
