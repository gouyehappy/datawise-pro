package org.apache.datawise.sqlparser.analysis;

/** Qualified {@code table.column} reference extracted from SQL. */
public record QualifiedColumn(String tableOrAlias, String column) {
}
