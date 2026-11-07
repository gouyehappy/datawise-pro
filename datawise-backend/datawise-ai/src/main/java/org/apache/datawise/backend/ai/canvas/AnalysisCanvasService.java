package org.apache.datawise.backend.ai.canvas;

import org.apache.datawise.backend.common.pack.AnalysisCanvasRerun;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.configstore.AnalysisCanvasStore;
import org.apache.datawise.backend.domain.AnalysisCanvasDetailDto;
import org.apache.datawise.backend.domain.AnalysisCanvasSummaryDto;
import org.apache.datawise.backend.domain.RerunAnalysisCanvasRequest;
import org.apache.datawise.backend.domain.SaveAnalysisCanvasRequest;
import org.apache.datawise.backend.model.AiAnalysisCanvasEntry;
import org.apache.datawise.backend.model.AiCanvasParameter;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

@Service
public class AnalysisCanvasService implements AnalysisCanvasRerun {

    private final AnalysisCanvasStore canvasStore;

    public AnalysisCanvasService(AnalysisCanvasStore canvasStore) {
        this.canvasStore = canvasStore;
    }

    public List<AnalysisCanvasSummaryDto> list() {
        return canvasStore.listAll().stream()
                .sorted(Comparator.comparing(AiAnalysisCanvasEntry::getUpdatedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toSummary)
                .toList();
    }

    public AnalysisCanvasDetailDto get(String id) {
        AiAnalysisCanvasEntry entry = requireEntry(id);
        return toDetail(entry);
    }

    public AnalysisCanvasDetailDto save(SaveAnalysisCanvasRequest request) {
        if (request.title() == null || request.title().isBlank()) {
            throw new IllegalArgumentException("title is required");
        }
        Instant now = Instant.now();
        AiAnalysisCanvasEntry entry = request.id() != null && !request.id().isBlank()
                ? canvasStore.findById(request.id())
                : null;
        if (entry == null) {
            entry = new AiAnalysisCanvasEntry();
            entry.setId(IdGenerator.shortId("canvas-"));
            entry.setCreatedAt(now);
        }
        entry.setTitle(request.title().trim());
        entry.setDescription(trimOrNull(request.description()));
        entry.setPromptTemplate(trimOrNull(request.promptTemplate()));
        entry.setParameters(request.parameters() != null ? request.parameters() : List.of());
        entry.setSql(trimOrNull(request.sql()));
        entry.setSummary(trimOrNull(request.summary()));
        entry.setChartSpecJson(trimOrNull(request.chartSpecJson()));
        entry.setReportMarkdown(trimOrNull(request.reportMarkdown()));
        entry.setTargetsJson(trimOrNull(request.targetsJson()));
        entry.setUpdatedAt(now);
        canvasStore.upsert(entry);
        return toDetail(entry);
    }

    public void delete(String id) {
        requireEntry(id);
        canvasStore.removeById(id);
    }

    /**
     * 将参数占位符 {@code {{key}}} 替换后返回可执行的 prompt / SQL。
     */
    @Override
    public RerunAnalysisCanvasResult rerun(RerunAnalysisCanvasRequest request) {
        AiAnalysisCanvasEntry entry = requireEntry(request.canvasId());
        Map<String, String> values = request.parameterValues() != null
                ? request.parameterValues()
                : Map.of();
        String prompt = applyParameters(entry.getPromptTemplate(), values, entry.getParameters());
        String sql = applyParameters(entry.getSql(), values, entry.getParameters());
        return new RerunAnalysisCanvasResult(
                entry.getId(),
                entry.getTitle(),
                prompt,
                sql,
                entry.getTargetsJson()
        );
    }

    public record RerunAnalysisCanvasResult(
            String canvasId,
            String title,
            String prompt,
            String sql,
            String targetsJson
    ) {
    }

    private AiAnalysisCanvasEntry requireEntry(String id) {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("id is required");
        }
        AiAnalysisCanvasEntry entry = canvasStore.findById(id);
        if (entry == null) {
            throw new IllegalArgumentException("canvas not found: " + id);
        }
        return entry;
    }

    private static String applyParameters(
            String template,
            Map<String, String> values,
            List<AiCanvasParameter> parameters
    ) {
        if (template == null || template.isBlank()) {
            return template;
        }
        String result = template;
        if (parameters != null) {
            for (AiCanvasParameter param : parameters) {
                if (param.getKey() == null || param.getKey().isBlank()) {
                    continue;
                }
                String value = values.getOrDefault(param.getKey(), param.getDefaultValue());
                if (value == null) {
                    value = "";
                }
                result = result.replace("{{" + param.getKey() + "}}", value);
            }
        }
        return result;
    }

    private AnalysisCanvasSummaryDto toSummary(AiAnalysisCanvasEntry entry) {
        return new AnalysisCanvasSummaryDto(
                entry.getId(),
                entry.getTitle(),
                entry.getDescription(),
                entry.getParameters() != null ? entry.getParameters().size() : 0,
                entry.getCreatedAt(),
                entry.getUpdatedAt()
        );
    }

    private AnalysisCanvasDetailDto toDetail(AiAnalysisCanvasEntry entry) {
        return new AnalysisCanvasDetailDto(
                entry.getId(),
                entry.getTitle(),
                entry.getDescription(),
                entry.getPromptTemplate(),
                entry.getParameters(),
                entry.getSql(),
                entry.getSummary(),
                entry.getChartSpecJson(),
                entry.getReportMarkdown(),
                entry.getTargetsJson(),
                entry.getCreatedAt(),
                entry.getUpdatedAt()
        );
    }

    private static String trimOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
