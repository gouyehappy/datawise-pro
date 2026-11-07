package org.apache.datawise.backend.common.support;

public enum ConnectionAccessLevel {

    READONLY,
    READWRITE,
    DDL;

    public boolean allowsDml() {
        return this != READONLY;
    }

    public boolean allowsDdl() {
        return this == DDL;
    }

    /** Legacy alias for DML-capable access checks. */
    public boolean allowsWrite() {
        return allowsDml();
    }

    public ConnectionAccessLevel restrict(ConnectionAccessLevel other) {
        if (other == null) {
            return this;
        }
        return ordinal() <= other.ordinal() ? this : other;
    }
}
