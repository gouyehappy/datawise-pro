package org.apache.datawise.sqlflow.api;

import org.apache.datawise.sqlflow.model.SqlFlowColumnLineage;
import org.apache.datawise.sqlflow.model.SqlFlowWarning;

import java.util.List;
import java.util.Objects;

/** Normalized lineage output from SQLFlow analysis. */
public final class SqlFlowLineageResult {

    private final List<SqlFlowColumnLineage> columns;
    private final List<SqlFlowWarning> warnings;
    private final ParseQuality quality;
    private final String engineId;
    private final String engineVersion;
    private final DialectCompatibility dialectCompatibility;
    private final String rawPayload;

    public SqlFlowLineageResult(
            List<SqlFlowColumnLineage> columns,
            List<SqlFlowWarning> warnings,
            ParseQuality quality,
            String engineId,
            String engineVersion,
            DialectCompatibility dialectCompatibility,
            String rawPayload
    ) {
        this.columns = columns == null ? List.of() : List.copyOf(columns);
        this.warnings = warnings == null ? List.of() : List.copyOf(warnings);
        this.quality = quality == null ? ParseQuality.FAILED : quality;
        this.engineId = engineId;
        this.engineVersion = engineVersion;
        this.dialectCompatibility = dialectCompatibility == null ? DialectCompatibility.UNKNOWN : dialectCompatibility;
        this.rawPayload = rawPayload;
    }

    public static SqlFlowLineageResult failed(String engineId, String engineVersion, String code, String message) {
        return failed(engineId, engineVersion, DialectCompatibility.UNKNOWN, code, message);
    }

    public static SqlFlowLineageResult failed(
            String engineId,
            String engineVersion,
            DialectCompatibility dialectCompatibility,
            String code,
            String message
    ) {
        return new SqlFlowLineageResult(
                List.of(),
                List.of(SqlFlowWarning.of(code, message)),
                ParseQuality.FAILED,
                engineId,
                engineVersion,
                dialectCompatibility,
                null
        );
    }

    public List<SqlFlowColumnLineage> columns() {
        return columns;
    }

    public List<SqlFlowWarning> warnings() {
        return warnings;
    }

    public ParseQuality quality() {
        return quality;
    }

    public String engineId() {
        return engineId;
    }

    public String engineVersion() {
        return engineVersion;
    }

    public DialectCompatibility dialectCompatibility() {
        return dialectCompatibility;
    }

    public String rawPayload() {
        return rawPayload;
    }

    @Override
    public boolean equals(Object other) {
        if (other == this) {
            return true;
        }
        if (!(other instanceof SqlFlowLineageResult that)) {
            return false;
        }
        return Objects.equals(columns, that.columns)
                && Objects.equals(warnings, that.warnings)
                && quality == that.quality
                && Objects.equals(engineId, that.engineId)
                && Objects.equals(engineVersion, that.engineVersion)
                && dialectCompatibility == that.dialectCompatibility
                && Objects.equals(rawPayload, that.rawPayload);
    }

    @Override
    public int hashCode() {
        return Objects.hash(columns, warnings, quality, engineId, engineVersion, dialectCompatibility, rawPayload);
    }
}
