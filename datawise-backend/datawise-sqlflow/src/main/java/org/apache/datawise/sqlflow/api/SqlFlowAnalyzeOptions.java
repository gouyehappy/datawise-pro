package org.apache.datawise.sqlflow.api;

import java.nio.file.Path;
import java.util.Objects;

/**
 * Analysis options forwarded to SQLFlow when a GSP engine is available.
 * Profiles can be selected per dialect via {@link SqlFlowAnalyzeOptionsProfile}.
 */
public final class SqlFlowAnalyzeOptions {

    private final boolean simpleOutput;
    private final boolean tableLevelLineage;
    private final boolean showTemporaryTables;
    private final Path metadataEnvFile;

    private SqlFlowAnalyzeOptions(Builder builder) {
        this.simpleOutput = builder.simpleOutput;
        this.tableLevelLineage = builder.tableLevelLineage;
        this.showTemporaryTables = builder.showTemporaryTables;
        this.metadataEnvFile = builder.metadataEnvFile;
    }

    public static SqlFlowAnalyzeOptions defaults() {
        return builder().build();
    }

    public static Builder builder() {
        return new Builder();
    }

    public boolean isSimpleOutput() {
        return simpleOutput;
    }

    public boolean isTableLevelLineage() {
        return tableLevelLineage;
    }

    public boolean isShowTemporaryTables() {
        return showTemporaryTables;
    }

    public Path metadataEnvFile() {
        return metadataEnvFile;
    }

    public Builder toBuilder() {
        return builder()
                .simpleOutput(simpleOutput)
                .tableLevelLineage(tableLevelLineage)
                .showTemporaryTables(showTemporaryTables)
                .metadataEnvFile(metadataEnvFile);
    }

    public static final class Builder {
        private boolean simpleOutput = true;
        private boolean tableLevelLineage;
        private boolean showTemporaryTables;
        private Path metadataEnvFile;

        public Builder simpleOutput(boolean simpleOutput) {
            this.simpleOutput = simpleOutput;
            return this;
        }

        public Builder tableLevelLineage(boolean tableLevelLineage) {
            this.tableLevelLineage = tableLevelLineage;
            return this;
        }

        public Builder showTemporaryTables(boolean showTemporaryTables) {
            this.showTemporaryTables = showTemporaryTables;
            return this;
        }

        public Builder metadataEnvFile(Path metadataEnvFile) {
            this.metadataEnvFile = metadataEnvFile;
            return this;
        }

        public SqlFlowAnalyzeOptions build() {
            return new SqlFlowAnalyzeOptions(this);
        }
    }

    @Override
    public boolean equals(Object other) {
        if (other == this) {
            return true;
        }
        if (!(other instanceof SqlFlowAnalyzeOptions that)) {
            return false;
        }
        return simpleOutput == that.simpleOutput
                && tableLevelLineage == that.tableLevelLineage
                && showTemporaryTables == that.showTemporaryTables
                && Objects.equals(metadataEnvFile, that.metadataEnvFile);
    }

    @Override
    public int hashCode() {
        return Objects.hash(simpleOutput, tableLevelLineage, showTemporaryTables, metadataEnvFile);
    }
}
