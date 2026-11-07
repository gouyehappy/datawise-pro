package org.apache.datawise.backend.ai.analysis.plan;

import org.apache.datawise.backend.ai.analysis.support.AiAnalysisTargetSupport;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.domain.AiDatabaseTargetDto;
import org.apache.datawise.backend.ai.domain.AiAnalysisPlan;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 根据 prompt 与数据源 scope 生成分析执行计划
 */
@Component
public class AiAnalysisPlannerService {

    private static final Pattern PYTHON_INTENT = Pattern.compile(
            "(预测|回归|相关|相关性|统计检验|显著性|机器学习|拟合|forecast|regression|correlation|"
                    + "machine\\s*learning|scipy|pandas|numpy|python)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    public AiAnalysisPlan baselinePlan(AiChatRequest request) {
        return buildPlan(request, false);
    }

    public AiAnalysisPlan plan(AiChatRequest request, String prompt) {
        boolean requiresPython = PYTHON_INTENT.matcher(prompt != null ? prompt : "").find();
        return buildPlan(request, requiresPython);
    }

    private AiAnalysisPlan buildPlan(AiChatRequest request, boolean requiresPython) {
        List<AiDatabaseTargetDto> uniqueTargets =
                AiAnalysisTargetSupport.uniqueByConnectionDatabase(request.targets());
        List<String> labels = new ArrayList<>(uniqueTargets.size());
        for (AiDatabaseTargetDto target : uniqueTargets) {
            labels.add(AiAnalysisTargetSupport.formatSourceLabel(target));
        }
        boolean federated = uniqueTargets.size() > 1;
        String mode = federated
                ? AiAnalysisPlan.MODE_FEDERATED
                : (requiresPython ? AiAnalysisPlan.MODE_SQL_THEN_PYTHON : AiAnalysisPlan.MODE_SQL_ONLY);
        return new AiAnalysisPlan(mode, requiresPython, federated, List.copyOf(labels));
    }
}
