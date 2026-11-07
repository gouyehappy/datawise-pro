package org.apache.datawise.sqlflow.analyzer;

import com.google.common.collect.ImmutableSet;

import javax.annotation.concurrent.Immutable;

import java.util.Set;

import static java.util.Objects.requireNonNull;

/** Internal column lineage binding produced by {@link StatementAnalyzer}. */
@Immutable
public final class OutputColumn {

    private final String column;
    private final Set<Analysis.SourceColumn> sourceColumns;

    public OutputColumn(String column, Set<Analysis.SourceColumn> sourceColumns) {
        this.column = requireNonNull(column, "column is null");
        this.sourceColumns = ImmutableSet.copyOf(requireNonNull(sourceColumns, "sourceColumns is null"));
    }

    public String getColumn() {
        return column;
    }

    public Set<Analysis.SourceColumn> getSourceColumns() {
        return sourceColumns;
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hash(column, sourceColumns);
    }

    @Override
    public boolean equals(Object obj) {
        if (obj == this) {
            return true;
        }
        if (obj == null || getClass() != obj.getClass()) {
            return false;
        }
        OutputColumn entry = (OutputColumn) obj;
        return java.util.Objects.equals(column, entry.column)
                && java.util.Objects.equals(sourceColumns, entry.sourceColumns);
    }
}
