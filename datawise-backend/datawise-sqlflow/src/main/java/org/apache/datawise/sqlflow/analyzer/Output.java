package org.apache.datawise.sqlflow.analyzer;

import com.google.common.collect.ImmutableList;

import javax.annotation.concurrent.Immutable;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

import static java.util.Objects.requireNonNull;

/** Internal DML/DDL write target with optional output column lineage. */
@Immutable
public final class Output {

    private final String catalogName;
    private final String schema;
    private final String table;
    private final Optional<List<OutputColumn>> columns;

    public Output(
            String catalogName,
            String schema,
            String table,
            Optional<List<OutputColumn>> columns
    ) {
        this.catalogName = catalogName;
        this.schema = requireNonNull(schema, "schema is null");
        this.table = requireNonNull(table, "table is null");
        this.columns = requireNonNull(columns, "columns is null").map(ImmutableList::copyOf);
    }

    public String getCatalogName() {
        return catalogName;
    }

    public String getSchema() {
        return schema;
    }

    public String getTable() {
        return table;
    }

    public Optional<List<OutputColumn>> getColumns() {
        return columns;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (o == null || getClass() != o.getClass()) {
            return false;
        }
        Output output = (Output) o;
        return Objects.equals(catalogName, output.catalogName)
                && Objects.equals(schema, output.schema)
                && Objects.equals(table, output.table)
                && Objects.equals(columns, output.columns);
    }

    @Override
    public int hashCode() {
        return Objects.hash(catalogName, schema, table, columns);
    }
}
