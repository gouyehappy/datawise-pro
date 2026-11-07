package org.apache.datawise.backend.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * 可复用的 AI 分析画布（config/users/{id}/analysis-canvas.json）。
 */
public class AiAnalysisCanvasEntry {

    private String id;
    private String title;
    private String description;
    private String promptTemplate;
    private List<AiCanvasParameter> parameters = new ArrayList<>();
    private String sql;
    private String summary;
    private String chartSpecJson;
    private String reportMarkdown;
    private String targetsJson;
    private Instant createdAt;
    private Instant updatedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getPromptTemplate() {
        return promptTemplate;
    }

    public void setPromptTemplate(String promptTemplate) {
        this.promptTemplate = promptTemplate;
    }

    public List<AiCanvasParameter> getParameters() {
        return parameters;
    }

    public void setParameters(List<AiCanvasParameter> parameters) {
        this.parameters = parameters != null ? new ArrayList<>(parameters) : new ArrayList<>();
    }

    public String getSql() {
        return sql;
    }

    public void setSql(String sql) {
        this.sql = sql;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public String getChartSpecJson() {
        return chartSpecJson;
    }

    public void setChartSpecJson(String chartSpecJson) {
        this.chartSpecJson = chartSpecJson;
    }

    public String getReportMarkdown() {
        return reportMarkdown;
    }

    public void setReportMarkdown(String reportMarkdown) {
        this.reportMarkdown = reportMarkdown;
    }

    public String getTargetsJson() {
        return targetsJson;
    }

    public void setTargetsJson(String targetsJson) {
        this.targetsJson = targetsJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
