package org.apache.datawise.backend.ai.chat;

import org.apache.datawise.backend.ai.domain.AiAnalysisRunOutcome;
import org.apache.datawise.backend.ai.domain.AiAnalysisStepEvent;
import org.apache.datawise.backend.ai.domain.AiAnalysisResumeRequest;
import org.apache.datawise.backend.ai.domain.AiChatReply;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.analysis.AiAnalysisPipeline;
import org.springframework.stereotype.Service;

import java.util.function.Consumer;

@Service
public class AiDataAgentService {

    private final AiAnalysisPipeline aiAnalysisPipeline;

    public AiDataAgentService(AiAnalysisPipeline aiAnalysisPipeline) {
        this.aiAnalysisPipeline = aiAnalysisPipeline;
    }

    public AiChatReply analyze(AiChatRequest request) {
        return aiAnalysisPipeline.run(request, null);
    }

    public AiAnalysisRunOutcome analyzeStream(AiChatRequest request, Consumer<AiAnalysisStepEvent> onStep) {
        return aiAnalysisPipeline.runWithOutcome(request, onStep, true);
    }

    public AiAnalysisRunOutcome resumeStream(AiAnalysisResumeRequest request, Consumer<AiAnalysisStepEvent> onStep) {
        return aiAnalysisPipeline.resume(request, onStep);
    }
}
