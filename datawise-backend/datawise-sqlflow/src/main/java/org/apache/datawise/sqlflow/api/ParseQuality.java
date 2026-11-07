package org.apache.datawise.sqlflow.api;

/** Overall completeness of a SQLFlow lineage analysis run. */
public enum ParseQuality {
    COMPLETE,
    PARTIAL,
    FAILED
}
