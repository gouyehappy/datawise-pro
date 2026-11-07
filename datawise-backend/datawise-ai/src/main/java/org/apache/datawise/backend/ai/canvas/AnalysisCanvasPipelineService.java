package org.apache.datawise.backend.ai.canvas;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.ai.chat.AiDataAgentService;
import org.apache.datawise.backend.ai.domain.AiChatReply;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.domain.AiDatabaseTargetDto;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.apache.datawise.backend.ai.support.UserAiLlmResolver;
import org.apache.datawise.backend.configstore.AnalysisCanvasStore;
import org.apache.datawise.backend.domain.RerunAnalysisCanvasRequest;
import org.apache.datawise.backend.model.AiAnalysisCanvasEntry;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * 分析画布完整 AI 流水线重跑：参数替换 → DataAgent 分析 → 回写画布结果。
 */
@Service
public class AnalysisCanvasPipelineService {

    private final AnalysisCanvasService canvasService;
    private final AnalysisCanvasStore canvasStore;
    private final AiDataAgentService aiDataAgentService;
    private final UserAiLlmResolver userAiLlmResolver;
    private final ObjectMapper objectMapper;

    public AnalysisCanvasPipelineService(
            AnalysisCanvasService canvasService,
            AnalysisCanvasStore canvasStore,
            AiDataAgentService aiDataAgentService,
            UserAiLlmResolver userAiLlmResolver,
            ObjectMapper objectMapper
    ) {
        this.canvasService = canvasService;
        this.canvasStore = canvasStore;
        this.aiDataAgentService = aiDataAgentService;
        this.userAiLlmResolver = userAiLlmResolver;
        this.objectMapper = objectMapper;
    }

    public PipelineRerunResult rerunPipeline(RerunAnalysisCanvasRequest request) {
        AnalysisCanvasService.RerunAnalysisCanvasResult prepared = canvasService.rerun(request);
        String prompt = prepared.prompt();
        if (prompt == null || prompt.isBlank()) {
            throw new IllegalArgumentException("canvas prompt is required for AI pipeline rerun");
        }

        AiAnalysisCanvasEntry entry = requireEntry(request.canvasId());
        List<AiDatabaseTargetDto> targets = AnalysisCanvasTargetParser.parse(entry.getTargetsJson());
        AiLlmProfileDto llm = userAiLlmResolver.resolveForCurrentUser()
                .orElseThrow(() -> new IllegalArgumentException("AI LLM profile is not configured"));

        AiChatRequest chatRequest = new AiChatRequest(
                prompt,
                targets,
                llm,
                null,
                true,
                List.of(),
                "smart",
                Map.of()
        );
        AiChatReply reply = aiDataAgentService.analyze(chatRequest);
        applyPipelineResult(entry, reply);
        return new PipelineRerunResult(
                entry.getId(),
                entry.getTitle(),
                reply.reply(),
                reply.sql(),
                reply.mode(),
                reply.rows() != null ? reply.rows().size() : 0
        );
    }

    private void applyPipelineResult(AiAnalysisCanvasEntry entry, AiChatReply reply) {
        if (reply.sql() != null && !reply.sql().isBlank()) {
            entry.setSql(reply.sql().trim());
        }
        if (reply.reply() != null && !reply.reply().isBlank()) {
            entry.setSummary(reply.reply().trim());
        }
        if (reply.chart() != null) {
            try {
                entry.setChartSpecJson(objectMapper.writeValueAsString(reply.chart()));
            } catch (Exception ignored) {
                // keep previous chart on serialization failure
            }
        }
        if (reply.report() != null && reply.report().markdown() != null && !reply.report().markdown().isBlank()) {
            entry.setReportMarkdown(reply.report().markdown().trim());
        }
        entry.setUpdatedAt(Instant.now());
        canvasStore.upsert(entry);
    }

    private AiAnalysisCanvasEntry requireEntry(String id) {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("canvas id is required");
        }
        AiAnalysisCanvasEntry entry = canvasStore.findById(id);
        if (entry == null) {
            throw new IllegalArgumentException("canvas not found: " + id);
        }
        return entry;
    }

    public record PipelineRerunResult(
            String canvasId,
            String title,
            String summary,
            String sql,
            String mode,
            int rowCount
    ) {
        public String statusMessage() {
            StringBuilder builder = new StringBuilder();
            if (title != null && !title.isBlank()) {
                builder.append(title);
            }
            if (rowCount > 0) {
                if (!builder.isEmpty()) {
                    builder.append(" · ");
                }
                builder.append(rowCount).append(" rows");
            }
            if (summary != null && !summary.isBlank()) {
                if (!builder.isEmpty()) {
                    builder.append(" · ");
                }
                String clipped = summary.length() > 120 ? summary.substring(0, 117) + "..." : summary;
                builder.append(clipped.replace('\n', ' '));
            }
            return builder.isEmpty() ? "completed" : builder.toString();
        }
    }
}
