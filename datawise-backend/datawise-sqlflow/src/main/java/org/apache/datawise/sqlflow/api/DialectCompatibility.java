package org.apache.datawise.sqlflow.api;

/** Compatibility level between incoming dbType dialect and SQLFlow AST engine grammar. */
public enum DialectCompatibility {
    FULL,
    PARTIAL,
    LOW,
    UNKNOWN
}
