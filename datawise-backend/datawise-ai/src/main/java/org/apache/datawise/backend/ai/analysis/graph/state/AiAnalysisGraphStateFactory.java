package org.apache.datawise.backend.ai.analysis.graph.state;

import com.alibaba.cloud.ai.graph.KeyStrategy;
import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.OverAllStateFactory;
import com.alibaba.cloud.ai.graph.state.strategy.ReplaceStrategy;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;

import java.util.HashMap;
import java.util.Map;

/**
 * StateGraph 初始状态工厂。
 * OverAllState 仅合并已注册 {@link KeyStrategy} 的键；invoke 输入与节点输出均需在此注册。
 */
public final class AiAnalysisGraphStateFactory implements OverAllStateFactory {

    private static final ReplaceStrategy REPLACE = new ReplaceStrategy();

    @Override
    public OverAllState create() {
        return newConfiguredState();
    }

    public static OverAllState fromCheckpointData(Map<String, Object> data) {
        OverAllState state = newConfiguredState();
        if (data != null && !data.isEmpty()) {
            state.updateState(new HashMap<>(data));
        }
        return state;
    }

    private static OverAllState newConfiguredState() {
        OverAllState state = new OverAllState();
        state.registerKeyAndStrategy(keyStrategies());
        return state;
    }

    static Map<String, KeyStrategy> keyStrategies() {
        Map<String, KeyStrategy> strategies = new HashMap<>();
        register(strategies, AiAnalysisGraphKeys.REQUEST);
        register(strategies, AiAnalysisGraphKeys.USER_ID);
        register(strategies, AiAnalysisGraphKeys.USER_GUEST);
        register(strategies, AiAnalysisGraphKeys.SESSION_ID);
        register(strategies, AiAnalysisGraphKeys.PROMPT);
        register(strategies, AiAnalysisGraphKeys.CONNECTION_ID);
        register(strategies, AiAnalysisGraphKeys.DATABASE);
        register(strategies, AiAnalysisGraphKeys.PLAN);
        register(strategies, AiAnalysisGraphKeys.STEP_ROUTE);
        register(strategies, AiAnalysisGraphKeys.RUN_DISABLED_STEPS);
        register(strategies, AiAnalysisGraphKeys.EVIDENCE);
        register(strategies, AiAnalysisGraphKeys.SCHEMA);
        register(strategies, AiAnalysisGraphKeys.SQL);
        register(strategies, AiAnalysisGraphKeys.SAFE_SQL);
        register(strategies, AiAnalysisGraphKeys.EXECUTE_RESULT);
        register(strategies, AiAnalysisGraphKeys.CHART);
        register(strategies, AiAnalysisGraphKeys.SUMMARY);
        register(strategies, AiAnalysisGraphKeys.REPORT);
        register(strategies, AiAnalysisGraphKeys.REPLY);
        register(strategies, AiAnalysisGraphKeys.PYTHON_CODE);
        register(strategies, AiAnalysisGraphKeys.PYTHON_RESULT);
        register(strategies, AiAnalysisGraphKeys.PYTHON_INSIGHT);
        register(strategies, AiAnalysisGraphKeys.PYTHON_OK);
        register(strategies, AiAnalysisGraphKeys.PYTHON_ERROR);
        register(strategies, AiAnalysisGraphKeys.PYTHON_RETRY_COUNT);
        register(strategies, AiAnalysisGraphKeys.VALIDATION_OK);
        register(strategies, AiAnalysisGraphKeys.VALIDATION_ERROR);
        register(strategies, AiAnalysisGraphKeys.SQL_RETRY_COUNT);
        register(strategies, AiAnalysisGraphKeys.SQL_APPROVED);
        register(strategies, AiAnalysisGraphKeys.EXECUTION_OK);
        register(strategies, AiAnalysisGraphKeys.EXECUTION_ERROR);
        register(strategies, AiAnalysisGraphKeys.EXECUTION_ERROR_LINE);
        register(strategies, AiAnalysisGraphKeys.EXECUTION_FAILED_SQL);
        register(strategies, AiAnalysisSteps.INTENT);
        register(strategies, AiAnalysisSteps.STEP_ROUTE);
        register(strategies, AiAnalysisSteps.PLANNER);
        register(strategies, AiAnalysisSteps.EVIDENCE);
        register(strategies, AiAnalysisSteps.SCHEMA);
        register(strategies, AiAnalysisSteps.SQL_GENERATE);
        register(strategies, AiAnalysisSteps.SQL_VALIDATE);
        register(strategies, AiAnalysisSteps.SQL_EXECUTE);
        register(strategies, AiAnalysisSteps.PYTHON_GENERATE);
        register(strategies, AiAnalysisSteps.PYTHON_EXECUTE);
        register(strategies, AiAnalysisSteps.PYTHON_ANALYZE);
        register(strategies, AiAnalysisSteps.CHART);
        register(strategies, AiAnalysisSteps.SUMMARY);
        register(strategies, AiAnalysisSteps.REPORT);
        register(strategies, AiAnalysisGraphKeys.STEP_ANALYSIS_FAILED);
        return strategies;
    }

    private static void register(Map<String, KeyStrategy> strategies, String key) {
        strategies.put(key, REPLACE);
    }
}
