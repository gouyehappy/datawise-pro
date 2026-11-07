package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepGate;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepRunner;
import org.apache.datawise.backend.ai.rag.AiEvidenceRecallRequest;
import org.apache.datawise.backend.ai.rag.AiEvidenceRecallService;
import org.apache.datawise.backend.ai.schema.AiSchemaContextService;
import org.apache.datawise.backend.ai.support.AiCallLogger;
import org.apache.datawise.backend.ai.domain.AiEvidenceBundle;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 步骤 2/8：RAG 召回业务词条、schema 注释，为 SQL 生成提供 evidence。
 */
@Component
public class EvidenceAnalysisNode {

    private static final Logger log = LoggerFactory.getLogger(EvidenceAnalysisNode.class);

    private final AiSchemaContextService aiSchemaContextService;
    private final AiEvidenceRecallService evidenceRecallService;
    private final AnalysisStepGate stepGate;

    public EvidenceAnalysisNode(
            AiSchemaContextService aiSchemaContextService,
            AiEvidenceRecallService evidenceRecallService,
            AnalysisStepGate stepGate
    ) {
        this.aiSchemaContextService = aiSchemaContextService;
        this.evidenceRecallService = evidenceRecallService;
        this.stepGate = stepGate;
    }

    public Map<String, Object> execute(OverAllState state) {
        return AnalysisNodeSupport.runWithUserContext(state, () -> executeInternal(state));
    }

    private Map<String, Object> executeInternal(OverAllState state) {
        String prompt = state.value(AiAnalysisGraphKeys.PROMPT, "");
        var skipped = stepGate.skipUnlessEnabled(
                AiAnalysisSteps.EVIDENCE,
                state,
                Map.of(AiAnalysisGraphKeys.EVIDENCE, AiEvidenceBundle.empty(prompt))
        );
        if (skipped.isPresent()) {
            return skipped.get();
        }
        AnalysisNodeSupport.ConnectionScope scope = AnalysisNodeSupport.readConnectionScope(state);
        long stepStart = AnalysisStepRunner.start();

        AnalysisStepRunner.running(AiAnalysisSteps.EVIDENCE, "召回业务词条与 schema 注释");
        List<String> candidateTables = aiSchemaContextService.listTableNames(
                scope.connectionId(), scope.database()
        );
        AiEvidenceBundle evidence = evidenceRecallService.recall(new AiEvidenceRecallRequest(
                scope.connectionId(),
                scope.database(),
                scope.prompt(),
                candidateTables
        ));

        int snippetCount = evidence.snippets() != null ? evidence.snippets().size() : 0;
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("snippetCount", snippetCount);
        detail.put("hintedTables", evidence.hintedTables());
        detail.put("modes", evidence.retrievalModes());
        String okMessage = snippetCount == 0 ? "未命中额外 evidence" : "Evidence 已召回";
        AnalysisStepRunner.ok(AiAnalysisSteps.EVIDENCE, okMessage, stepStart, detail);
        AiCallLogger.logAnalysisStep(
                log,
                "evidence",
                "snippets",
                snippetCount,
                "hints",
                detail.get("hintedTables")
        );

        return Map.of(AiAnalysisGraphKeys.EVIDENCE, evidence);
    }
}
