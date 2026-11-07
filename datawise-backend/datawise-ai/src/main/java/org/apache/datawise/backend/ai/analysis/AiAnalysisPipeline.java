package org.apache.datawise.backend.ai.analysis;

import org.apache.datawise.backend.ai.analysis.graph.runner.AiAnalysisGraphRunner;
import org.apache.datawise.backend.ai.domain.AiAnalysisResumeRequest;
import org.apache.datawise.backend.ai.domain.AiAnalysisRunOutcome;
import org.apache.datawise.backend.ai.domain.AiAnalysisStepEvent;
import org.apache.datawise.backend.ai.domain.AiChatReply;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.springframework.stereotype.Component;

import java.util.function.Consumer;

/**
 * DataAgent 分析流水线门面。
 * Spring AI Alibaba StateGraph + Human-in-the-loop。
 */
@Component
public class AiAnalysisPipeline {

    private final AiAnalysisGraphRunner graphRunner;

    public AiAnalysisPipeline(AiAnalysisGraphRunner graphRunner) {
        this.graphRunner = graphRunner;
    }

    public AiChatReply run(AiChatRequest request, Consumer<AiAnalysisStepEvent> onStep) {
        return runWithOutcome(request, onStep, false).reply();
    }

    public AiAnalysisRunOutcome runWithOutcome(
            AiChatRequest request,
            Consumer<AiAnalysisStepEvent> onStep,
            boolean humanInTheLoop
    ) {
        return graphRunner.run(request, onStep, humanInTheLoop);
    }

    public AiAnalysisRunOutcome resume(AiAnalysisResumeRequest request, Consumer<AiAnalysisStepEvent> onStep) {
        return graphRunner.resume(request, onStep);
    }
}
