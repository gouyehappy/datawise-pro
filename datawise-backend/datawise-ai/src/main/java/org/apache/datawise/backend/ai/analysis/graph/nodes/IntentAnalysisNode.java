package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateCoercion;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepRunner;
import org.apache.datawise.backend.ai.support.AiCallLogger;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.domain.AiDatabaseTargetDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 步骤 1/8：解析请求，确认主数据源 connectionId / database。
 * 当前执行层仅使用第一个可执行 target；其余 target 写入步骤 detail 供审计。
 */
@Component
public class IntentAnalysisNode {

    private static final Logger log = LoggerFactory.getLogger(IntentAnalysisNode.class);

    public Map<String, Object> execute(OverAllState state) {
        AiChatRequest request = AiAnalysisGraphStateCoercion.requireRequest(state);
        String prompt = AnalysisNodeSupport.requirePrompt(request.prompt());
        long stepStart = AnalysisStepRunner.start();

        AnalysisStepRunner.running(AiAnalysisSteps.INTENT, "确认数据源与分析意图");
        AiDatabaseTargetDto target = AnalysisNodeSupport.resolvePrimaryTarget(request.targets());
        String connectionId = target.connectionId();
        String database = AnalysisNodeSupport.resolveDatabase(target);
        List<String> additionalTargets = AnalysisNodeSupport.listAdditionalTargets(request.targets(), target);

        Map<String, Object> intentDetail = new LinkedHashMap<>();
        intentDetail.put("connectionId", connectionId);
        intentDetail.put("database", database);
        intentDetail.put("targetCount", request.targets() != null ? request.targets().size() : 0);
        if (!additionalTargets.isEmpty()) {
            intentDetail.put("additionalTargets", additionalTargets);
            intentDetail.put("multiTargetNote", "当前版本仅对主数据源执行分析");
        }

        String okMessage = additionalTargets.isEmpty() ? "已确认数据源" : "已确认主数据源（存在多个 scope）";
        AnalysisStepRunner.ok(AiAnalysisSteps.INTENT, okMessage, stepStart, intentDetail);
        AiCallLogger.logAnalysisStep(log, "start", "connectionId", connectionId, "database", database, "prompt", prompt);

        return Map.of(
                AiAnalysisGraphKeys.REQUEST, request,
                AiAnalysisGraphKeys.PROMPT, prompt,
                AiAnalysisGraphKeys.CONNECTION_ID, connectionId,
                AiAnalysisGraphKeys.DATABASE, database
        );
    }
}
