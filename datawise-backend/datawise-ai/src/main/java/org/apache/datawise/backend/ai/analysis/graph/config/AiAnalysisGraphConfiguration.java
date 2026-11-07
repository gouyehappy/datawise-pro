package org.apache.datawise.backend.ai.analysis.graph.config;

import com.alibaba.cloud.ai.graph.CompileConfig;
import com.alibaba.cloud.ai.graph.CompiledGraph;
import com.alibaba.cloud.ai.graph.StateGraph;
import com.alibaba.cloud.ai.graph.checkpoint.BaseCheckpointSaver;
import com.alibaba.cloud.ai.graph.checkpoint.config.SaverConfig;
import com.alibaba.cloud.ai.graph.checkpoint.constant.SaverConstant;
import com.alibaba.cloud.ai.graph.checkpoint.savers.FileSystemSaver;
import com.alibaba.cloud.ai.graph.checkpoint.savers.MemorySaver;
import com.alibaba.cloud.ai.graph.exception.GraphStateException;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.checkpoint.AiAnalysisGsonStateSerializer;
import org.apache.datawise.backend.ai.analysis.graph.nodes.AnalysisFailedNode;
import org.apache.datawise.backend.ai.analysis.graph.nodes.ChartAnalysisNode;
import org.apache.datawise.backend.ai.analysis.graph.nodes.EvidenceAnalysisNode;
import org.apache.datawise.backend.ai.analysis.graph.nodes.IntentAnalysisNode;
import org.apache.datawise.backend.ai.analysis.graph.nodes.PlannerAnalysisNode;
import org.apache.datawise.backend.ai.analysis.graph.nodes.PythonAnalyzeAnalysisNode;
import org.apache.datawise.backend.ai.analysis.graph.nodes.PythonExecuteAnalysisNode;
import org.apache.datawise.backend.ai.analysis.graph.nodes.PythonGenerateAnalysisNode;
import org.apache.datawise.backend.ai.analysis.graph.nodes.ReportAnalysisNode;
import org.apache.datawise.backend.ai.analysis.graph.nodes.SchemaAnalysisNode;
import org.apache.datawise.backend.ai.analysis.graph.nodes.SqlExecuteAnalysisNode;
import org.apache.datawise.backend.ai.analysis.graph.nodes.SqlGenerateAnalysisNode;
import org.apache.datawise.backend.ai.analysis.graph.nodes.SqlValidateAnalysisNode;
import org.apache.datawise.backend.ai.analysis.graph.nodes.StepRouteAnalysisNode;
import org.apache.datawise.backend.ai.analysis.graph.nodes.SummaryAnalysisNode;
import org.apache.datawise.backend.ai.analysis.graph.runtime.AiAnalysisChartRouter;
import org.apache.datawise.backend.ai.analysis.graph.runtime.AiAnalysisExecuteRouter;
import org.apache.datawise.backend.ai.analysis.graph.runtime.AiAnalysisPythonRouter;
import org.apache.datawise.backend.ai.analysis.graph.runtime.AiAnalysisValidateRouter;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateFactory;
import org.apache.datawise.backend.ai.config.AiAnalysisProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static com.alibaba.cloud.ai.graph.action.AsyncEdgeAction.edge_async;
import static com.alibaba.cloud.ai.graph.action.AsyncNodeAction.node_async;

/**
 * DataAgent 分析 StateGraph。
 * intent → step_route → planner → evidence → schema → sql_* → [python_*] → chart → summary → report
 */
@Configuration
public class AiAnalysisGraphConfiguration {

    private static final Logger log = LoggerFactory.getLogger(AiAnalysisGraphConfiguration.class);

    @Bean
    public BaseCheckpointSaver aiAnalysisCheckpointSaver(
            AiAnalysisProperties analysisProperties,
            ConfigDirectoryService configDirectoryService
    ) throws IOException {
        if (analysisProperties.getCheckpoint().isFileStorage()) {
            Path checkpointDir = configDirectoryService.resolve("ai-checkpoints");
            Files.createDirectories(checkpointDir);
            log.info("AI analysis checkpoint storage=file dir={}", checkpointDir);
            return new FileSystemSaver(checkpointDir, new AiAnalysisGsonStateSerializer());
        }
        log.info("AI analysis checkpoint storage=memory");
        return new MemorySaver();
    }

    @Bean
    public CompileConfig aiAnalysisCompileConfig(
            BaseCheckpointSaver aiAnalysisCheckpointSaver,
            AiAnalysisProperties analysisProperties
    ) {
        String saverKey = analysisProperties.getCheckpoint().isFileStorage()
                ? SaverConstant.FILE
                : SaverConstant.MEMORY;
        SaverConfig saverConfig = SaverConfig.builder()
                .register(saverKey, aiAnalysisCheckpointSaver)
                .build();
        return CompileConfig.builder()
                .saverConfig(saverConfig)
                .interruptBefore(AiAnalysisSteps.SQL_EXECUTE)
                .build();
    }

    @Bean
    public StateGraph aiAnalysisStateGraph(
            IntentAnalysisNode intentNode,
            StepRouteAnalysisNode stepRouteNode,
            PlannerAnalysisNode plannerNode,
            EvidenceAnalysisNode evidenceNode,
            SchemaAnalysisNode schemaNode,
            SqlGenerateAnalysisNode sqlGenerateNode,
            SqlValidateAnalysisNode sqlValidateNode,
            SqlExecuteAnalysisNode sqlExecuteNode,
            PythonGenerateAnalysisNode pythonGenerateNode,
            PythonExecuteAnalysisNode pythonExecuteNode,
            PythonAnalyzeAnalysisNode pythonAnalyzeNode,
            ChartAnalysisNode chartNode,
            SummaryAnalysisNode summaryNode,
            ReportAnalysisNode reportNode,
            AnalysisFailedNode analysisFailedNode,
            AiAnalysisValidateRouter validateRouter,
            AiAnalysisExecuteRouter executeRouter,
            AiAnalysisPythonRouter pythonRouter,
            AiAnalysisChartRouter chartRouter
    ) throws GraphStateException {
        return new StateGraph("datawise-analysis", new AiAnalysisGraphStateFactory())
                .addNode(AiAnalysisSteps.INTENT, node_async(intentNode::execute))
                .addNode(AiAnalysisSteps.STEP_ROUTE, node_async(stepRouteNode::execute))
                .addNode(AiAnalysisSteps.PLANNER, node_async(plannerNode::execute))
                .addNode(AiAnalysisSteps.EVIDENCE, node_async(evidenceNode::execute))
                .addNode(AiAnalysisSteps.SCHEMA, node_async(schemaNode::execute))
                .addNode(AiAnalysisSteps.SQL_GENERATE, node_async(sqlGenerateNode::execute))
                .addNode(AiAnalysisSteps.SQL_VALIDATE, node_async(sqlValidateNode::execute))
                .addNode(AiAnalysisSteps.SQL_EXECUTE, node_async(sqlExecuteNode::execute))
                .addNode(AiAnalysisSteps.PYTHON_GENERATE, node_async(pythonGenerateNode::execute))
                .addNode(AiAnalysisSteps.PYTHON_EXECUTE, node_async(pythonExecuteNode::execute))
                .addNode(AiAnalysisSteps.PYTHON_ANALYZE, node_async(pythonAnalyzeNode::execute))
                .addNode(AiAnalysisSteps.CHART, node_async(chartNode::execute))
                .addNode(AiAnalysisSteps.SUMMARY, node_async(summaryNode::execute))
                .addNode(AiAnalysisSteps.REPORT, node_async(reportNode::execute))
                .addNode(AiAnalysisGraphKeys.STEP_ANALYSIS_FAILED, node_async(analysisFailedNode::execute))
                .addEdge(StateGraph.START, AiAnalysisSteps.INTENT)
                .addEdge(AiAnalysisSteps.INTENT, AiAnalysisSteps.STEP_ROUTE)
                .addEdge(AiAnalysisSteps.STEP_ROUTE, AiAnalysisSteps.PLANNER)
                .addEdge(AiAnalysisSteps.PLANNER, AiAnalysisSteps.EVIDENCE)
                .addEdge(AiAnalysisSteps.EVIDENCE, AiAnalysisSteps.SCHEMA)
                .addEdge(AiAnalysisSteps.SCHEMA, AiAnalysisSteps.SQL_GENERATE)
                .addEdge(AiAnalysisSteps.SQL_GENERATE, AiAnalysisSteps.SQL_VALIDATE)
                .addConditionalEdges(
                        AiAnalysisSteps.SQL_VALIDATE,
                        edge_async(validateRouter.edgeAction()),
                        Map.of(
                                AiAnalysisGraphKeys.ROUTE_VALIDATE_OK, AiAnalysisValidateRouter.okTarget(),
                                AiAnalysisGraphKeys.ROUTE_VALIDATE_RETRY, AiAnalysisValidateRouter.retryTarget(),
                                AiAnalysisGraphKeys.ROUTE_VALIDATE_FAILED, AiAnalysisValidateRouter.failedTarget()
                        )
                )
                .addConditionalEdges(
                        AiAnalysisSteps.SQL_EXECUTE,
                        edge_async(executeRouter.edgeAction()),
                        Map.of(
                                AiAnalysisGraphKeys.ROUTE_POST_EXECUTE_PYTHON, AiAnalysisExecuteRouter.pythonTarget(),
                                AiAnalysisGraphKeys.ROUTE_POST_EXECUTE_CHART, AiAnalysisExecuteRouter.chartTarget(),
                                AiAnalysisGraphKeys.ROUTE_EXECUTE_FAILED, AiAnalysisExecuteRouter.failedTarget()
                        )
                )
                .addEdge(AiAnalysisSteps.PYTHON_GENERATE, AiAnalysisSteps.PYTHON_EXECUTE)
                .addConditionalEdges(
                        AiAnalysisSteps.PYTHON_EXECUTE,
                        edge_async(pythonRouter.edgeAction()),
                        Map.of(
                                AiAnalysisGraphKeys.ROUTE_PYTHON_OK, AiAnalysisPythonRouter.okTarget(),
                                AiAnalysisGraphKeys.ROUTE_PYTHON_RETRY, AiAnalysisPythonRouter.retryTarget(),
                                AiAnalysisGraphKeys.ROUTE_PYTHON_FAILED, AiAnalysisPythonRouter.failedTarget()
                        )
                )
                .addEdge(AiAnalysisSteps.PYTHON_ANALYZE, AiAnalysisSteps.CHART)
                .addConditionalEdges(
                        AiAnalysisSteps.CHART,
                        edge_async(chartRouter.edgeAction()),
                        Map.of(
                                AiAnalysisGraphKeys.ROUTE_POST_CHART_OK, AiAnalysisChartRouter.summaryTarget(),
                                AiAnalysisGraphKeys.ROUTE_POST_CHART_FAILED, AiAnalysisChartRouter.failedTarget()
                        )
                )
                .addEdge(AiAnalysisSteps.SUMMARY, AiAnalysisSteps.REPORT)
                .addEdge(AiAnalysisSteps.REPORT, StateGraph.END)
                .addEdge(AiAnalysisGraphKeys.STEP_ANALYSIS_FAILED, StateGraph.END);
    }

    @Bean
    public CompiledGraph aiAnalysisCompiledGraph(
            StateGraph aiAnalysisStateGraph,
            CompileConfig aiAnalysisCompileConfig
    ) throws GraphStateException {
        return aiAnalysisStateGraph.compile(aiAnalysisCompileConfig);
    }
}
