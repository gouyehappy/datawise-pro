package org.apache.datawise.backend.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * DataAgent 分析流水线生产级配置
 */
@ConfigurationProperties(prefix = "datawise.ai.analysis")
public class AiAnalysisProperties {

    private final Checkpoint checkpoint = new Checkpoint();
    private final Retry retry = new Retry();
    private final Llm llm = new Llm();
    private final Steps steps = new Steps();
    /**
     * lenient | strict | off — 表引用语义校验；列名校验在 lenient 下也会阻断
     */
    private String semanticCheck = "strict";

    public Checkpoint getCheckpoint() {
        return checkpoint;
    }

    public Retry getRetry() {
        return retry;
    }

    public Llm getLlm() {
        return llm;
    }

    public Steps getSteps() {
        return steps;
    }

    public String getSemanticCheck() {
        return semanticCheck;
    }

    public void setSemanticCheck(String semanticCheck) {
        this.semanticCheck = semanticCheck != null ? semanticCheck.trim() : "strict";
    }

    public boolean isSemanticCheckStrict() {
        return "strict".equalsIgnoreCase(semanticCheck);
    }

    public boolean isSemanticCheckEnabled() {
        return semanticCheck != null && !"off".equalsIgnoreCase(semanticCheck);
    }

    public static class Checkpoint {
        /**
         * memory | file — file 使用 FileSystemSaver 持久化 interrupt 会话
         */
        private String storage = "memory";

        public String getStorage() {
            return storage;
        }

        public void setStorage(String storage) {
            this.storage = storage != null ? storage.trim() : "memory";
        }

        public boolean isFileStorage() {
            return "file".equalsIgnoreCase(storage);
        }
    }

    /**
     * 可选分析步骤开关（必选：intent / schema / sql_generate / sql_execute）
     */
    public static class Steps {
        private boolean planner = true;
        private boolean evidence = true;
        private boolean sqlValidate = true;
        private boolean python = true;
        private boolean chart = true;
        private boolean summary = true;
        private boolean report = true;

        public boolean isPlanner() {
            return planner;
        }

        public void setPlanner(boolean planner) {
            this.planner = planner;
        }

        public boolean isEvidence() {
            return evidence;
        }

        public void setEvidence(boolean evidence) {
            this.evidence = evidence;
        }

        public boolean isSqlValidate() {
            return sqlValidate;
        }

        public void setSqlValidate(boolean sqlValidate) {
            this.sqlValidate = sqlValidate;
        }

        public boolean isPython() {
            return python;
        }

        public void setPython(boolean python) {
            this.python = python;
        }

        public boolean isChart() {
            return chart;
        }

        public void setChart(boolean chart) {
            this.chart = chart;
        }

        public boolean isSummary() {
            return summary;
        }

        public void setSummary(boolean summary) {
            this.summary = summary;
        }

        public boolean isReport() {
            return report;
        }

        public void setReport(boolean report) {
            this.report = report;
        }

        public boolean isEnabled(String stepKey) {
            if (stepKey == null || stepKey.isBlank()) {
                return true;
            }
            return switch (stepKey) {
                case "planner" -> planner;
                case "evidence" -> evidence;
                case "sqlValidate", "sql_validate" -> sqlValidate;
                case "python", "python_generate", "python_execute", "python_analyze" -> python;
                case "chart" -> chart;
                case "summary" -> summary;
                case "report" -> report;
                default -> true;
            };
        }
    }

    public static class Retry {
        private int maxSqlValidationRetries = 2;
        private int maxSqlExecuteAttempts = 2;

        public int getMaxSqlValidationRetries() {
            return Math.max(1, maxSqlValidationRetries);
        }

        public void setMaxSqlValidationRetries(int maxSqlValidationRetries) {
            this.maxSqlValidationRetries = maxSqlValidationRetries;
        }

        public int getMaxSqlExecuteAttempts() {
            return Math.max(1, maxSqlExecuteAttempts);
        }

        public void setMaxSqlExecuteAttempts(int maxSqlExecuteAttempts) {
            this.maxSqlExecuteAttempts = maxSqlExecuteAttempts;
        }
    }

    public static class Llm {
        private int timeoutSeconds = 120;
        private int maxAttempts = 2;
        private long retryDelayMs = 400;

        public int getTimeoutSeconds() {
            return Math.max(5, timeoutSeconds);
        }

        public void setTimeoutSeconds(int timeoutSeconds) {
            this.timeoutSeconds = timeoutSeconds;
        }

        public int getMaxAttempts() {
            return Math.max(1, maxAttempts);
        }

        public void setMaxAttempts(int maxAttempts) {
            this.maxAttempts = maxAttempts;
        }

        public long getRetryDelayMs() {
            return Math.max(0, retryDelayMs);
        }

        public void setRetryDelayMs(long retryDelayMs) {
            this.retryDelayMs = retryDelayMs;
        }
    }
}
